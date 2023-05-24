use wasm_bindgen::prelude::*;
use dlmalloc;
use std::alloc::{GlobalAlloc, Layout};
 
#[global_allocator]
static ALLOCATOR: Allocator = Allocator::new();

#[no_mangle]
pub fn malloc(size: usize, align: usize) -> *mut u8 {
    ALLOCATOR.malloc(size, align)
}

#[no_mangle]
pub fn calloc(size: usize, align: usize) -> *mut u8 {
    ALLOCATOR.calloc(size, align)
}

#[no_mangle]
pub fn free(ptr: *mut u8, size: usize, align: usize) {
    ALLOCATOR.free(ptr, size, align)
}

#[no_mangle]
pub fn realloc(ptr: *mut u8, old_size: usize, old_align: usize, new_size: usize) -> *mut u8 {
    ALLOCATOR.realloc(ptr, old_size, old_align, new_size)
}

// the engine allocator is basically
// a straight copy-paste of the 
// standard wasm32 allocator 
// see: https://github.com/rust-lang/rust/blob/1.68.0/library/std/src/sys/wasm/alloc.rs
static mut DLMALLOC: dlmalloc::Dlmalloc = dlmalloc::Dlmalloc::new();
pub struct Allocator;

impl Allocator {
    pub const fn new() -> Self {
        Allocator
    }

    #[inline]
    fn malloc(&self, size: usize, align: usize) -> *mut u8 {
        // SAFETY: DLMALLOC access is guaranteed to be safe because the lock gives us unique and non-reentrant access.
        // Calling malloc() is safe because preconditions on this function match the trait method preconditions.
        let _lock = lock::lock();
        unsafe { DLMALLOC.malloc(size, align) }
    }

    #[inline]
    fn calloc(&self, size: usize, align: usize) -> *mut u8 {
        // SAFETY: DLMALLOC access is guaranteed to be safe because the lock gives us unique and non-reentrant access.
        // Calling calloc() is safe because preconditions on this function match the trait method preconditions.
        let _lock = lock::lock();
        unsafe { DLMALLOC.calloc(size, align) }
    }

    #[inline]
    fn free(&self, ptr: *mut u8, size: usize, align: usize) {
        // SAFETY: DLMALLOC access is guaranteed to be safe because the lock gives us unique and non-reentrant access.
        // Calling free() is safe because preconditions on this function match the trait method preconditions.
        let _lock = lock::lock();
        unsafe { DLMALLOC.free(ptr, size, align) }
    }
    
    #[inline]
    fn realloc(&self, ptr: *mut u8, old_size: usize, old_align: usize, new_size: usize) -> *mut u8 {
        // SAFETY: DLMALLOC access is guaranteed to be safe because the lock gives us unique and non-reentrant access.
        // Calling realloc() is safe because preconditions on this function match the trait method preconditions.
        let _lock = lock::lock();
        unsafe { DLMALLOC.realloc(ptr, old_size, old_align, new_size) }
    }
}

unsafe impl GlobalAlloc for Allocator {
    #[inline]
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        self.malloc(layout.size(), layout.align())
    }

    #[inline]
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        self.calloc(layout.size(), layout.align())
    }

    #[inline]
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        self.free(ptr, layout.size(), layout.align())
    }
    
    #[inline]
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        self.realloc(ptr, layout.size(), layout.align(), new_size)
    }
}

mod lock {
    use std::sync::atomic::{AtomicI32, Ordering::SeqCst};

    static LOCKED: AtomicI32 = AtomicI32::new(0);

    pub struct DropLock;

    pub fn lock() -> DropLock {
        loop {
            // this is a SPINLOCK, currently used because
            // atomic.wait is disallowed on main thread
            if LOCKED.swap(1, SeqCst) == 0 {
                return DropLock
            }
            // comment from original implemenation:
            // Ok so here's where things get a little depressing. At this point
            // in time we need to synchronously acquire a lock, but we're
            // contending with some other thread. Typically we'd execute some
            // form of `i32.atomic.wait` like so:
            //
            //     unsafe {
            //         let r = core::arch::wasm32::i32_atomic_wait(
            //             LOCKED.as_mut_ptr(),
            //             1,  //     expected value
            //             -1, //     timeout
            //         );
            //         debug_assert!(r == 0 || r == 1);
            //     }
            //
            // Unfortunately though in doing so we would cause issues for the
            // main thread. The main thread in a web browser *cannot ever
            // block*, no exceptions. This means that the main thread can't
            // actually execute the `i32.atomic.wait` instruction.
            //
            // As a result if we want to work within the context of browsers we
            // need to figure out some sort of allocation scheme for the main
            // thread where when there's contention on the global malloc lock we
            // do... something.
            //
            // Possible ideas include:
            //
            // 1. Attempt to acquire the global lock. If it fails, fall back to
            //    memory allocation via `memory.grow`. Later just ... somehow
            //    ... inject this raw page back into the main allocator as it
            //    gets sliced up over time. This strategy has the downside of
            //    forcing allocation of a page to happen whenever the main
            //    thread contents with other threads, which is unfortunate.
            //
            // 2. Maintain a form of "two level" allocator scheme where the main
            //    thread has its own allocator. Somehow this allocator would
            //    also be balanced with a global allocator, not only to have
            //    allocations cross between threads but also to ensure that the
            //    two allocators stay "balanced" in terms of free'd memory and
            //    such. This, however, seems significantly complicated.
            //
            // Out of a lack of other ideas, the current strategy implemented
            // here is to simply spin. Typical spin loop algorithms have some
            // form of "hint" here to the CPU that it's what we're doing to
            // ensure that the CPU doesn't get too hot, but wasm doesn't have
            // such an instruction.
            //
            // To be clear, spinning here is not a great solution.
            // Another thread with the lock may take quite a long time to wake
            // up. For example it could be in `memory.grow` or it could be
            // evicted from the CPU for a timeslice like 10ms. For these periods
            // of time our thread will "helpfully" sit here and eat CPU time
            // until it itself is evicted or the lock holder finishes. This
            // means we're just burning and wasting CPU time to no one's
            // benefit.
            //
            // Spinning does have the nice properties, though, of being
            // semantically correct, being fair to all threads for memory
            // allocation, and being simple enough to implement.
            //
            // This will surely (hopefully) be replaced in the future with a
            // real memory allocator that can handle the restriction of the main
            // thread.
            //
            //
            // FIXME: We can also possibly add an optimization here to detect
            // when a thread is the main thread or not and block on all
            // non-main-thread threads. Currently, however, we have no way
            // of knowing which wasm thread is on the browser main thread, but
            // if we could figure out we could at least somewhat mitigate the
            // cost of this spinning.
        }
    }

    impl Drop for DropLock {
        fn drop(&mut self) {
            let result = LOCKED.swap(0, SeqCst);
            debug_assert_eq!(result, 1);
            // comment from original implemenation:
            
            // Note that due to the above logic we don't actually need to wake
            // anyone up, but if we did it'd likely look something like this:
            //
            //     unsafe {
            //         core::arch::wasm32::atomic_notify(
            //             LOCKED.as_mut_ptr(),
            //             1, //     only one thread
            //         );
            //     }
        }
    }
}