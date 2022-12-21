// vite.config.ts
import { defineConfig } from "file:///home/moomoo/code/game-wrapper/node_modules/vite/dist/node/index.js";
import react from "file:///home/moomoo/code/game-wrapper/node_modules/@vitejs/plugin-react/dist/index.mjs";
var allowSharedArrayBuffer = () => ({
  name: "allow-shared-array-buffers",
  configureServer: (server) => {
    server.middlewares.use((_, res, next) => {
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      next();
    });
  }
});
var vite_config_default = defineConfig({
  plugins: [
    react(),
    allowSharedArrayBuffer()
  ],
  build: {
    manifest: "build-manifest.json",
    target: "es2020"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9tb29tb28vY29kZS9nYW1lLXdyYXBwZXJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL21vb21vby9jb2RlL2dhbWUtd3JhcHBlci92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9tb29tb28vY29kZS9nYW1lLXdyYXBwZXIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIFBsdWdpbk9wdGlvbiB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnXG5cbi8vIHRha2VuIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2NoYW9zcHJpbnQvdml0ZS1wbHVnaW4tY3Jvc3Mtb3JpZ2luLWlzb2xhdGlvblxuY29uc3QgYWxsb3dTaGFyZWRBcnJheUJ1ZmZlciA9ICgpID0+ICh7XG4gIG5hbWU6IFwiYWxsb3ctc2hhcmVkLWFycmF5LWJ1ZmZlcnNcIixcbiAgY29uZmlndXJlU2VydmVyOiAoc2VydmVyKSA9PiB7XG4gICAgc2VydmVyLm1pZGRsZXdhcmVzLnVzZSgoXywgcmVzLCBuZXh0KSA9PiB7XG4gICAgICByZXMuc2V0SGVhZGVyKFwiQ3Jvc3MtT3JpZ2luLUVtYmVkZGVyLVBvbGljeVwiLCBcInJlcXVpcmUtY29ycFwiKVxuICAgICAgcmVzLnNldEhlYWRlcihcIkNyb3NzLU9yaWdpbi1PcGVuZXItUG9saWN5XCIsIFwic2FtZS1vcmlnaW5cIilcbiAgICAgIG5leHQoKVxuICAgIH0pXG4gIH1cbn0gYXMgY29uc3QpIGFzIFBsdWdpbk9wdGlvblxuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgYWxsb3dTaGFyZWRBcnJheUJ1ZmZlcigpXG4gIF0sXG4gIGJ1aWxkOiB7XG4gICAgbWFuaWZlc3Q6IFwiYnVpbGQtbWFuaWZlc3QuanNvblwiLFxuICAgIHRhcmdldDogXCJlczIwMjBcIlxuICB9XG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE0USxTQUFTLG9CQUFrQztBQUN2VCxPQUFPLFdBQVc7QUFHbEIsSUFBTSx5QkFBeUIsT0FBTztBQUFBLEVBQ3BDLE1BQU07QUFBQSxFQUNOLGlCQUFpQixDQUFDLFdBQVc7QUFDM0IsV0FBTyxZQUFZLElBQUksQ0FBQyxHQUFHLEtBQUssU0FBUztBQUN2QyxVQUFJLFVBQVUsZ0NBQWdDLGNBQWM7QUFDNUQsVUFBSSxVQUFVLDhCQUE4QixhQUFhO0FBQ3pELFdBQUs7QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNIO0FBQ0Y7QUFHQSxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTix1QkFBdUI7QUFBQSxFQUN6QjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsVUFBVTtBQUFBLElBQ1YsUUFBUTtBQUFBLEVBQ1Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
