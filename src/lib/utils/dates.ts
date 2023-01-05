import * as time from "@/lib/utils/consts/time"

export const reactiveDate = (date: Date) => {
    const now = Date.now()
    const compareDate = new Date(date)
    const then = compareDate.getTime()
    const diff = now - then
    if (diff < time.MILLISECONDS_PER_SECOND * 10) {
        return "just now"
    } else if (diff < time.MILLISECONDS_PER_MINUTE) {
        return "< 1 min"
    } else if (diff < time.MILLISECONDS_PER_HOUR) {
        return `${Math.round(diff / time.MILLISECONDS_PER_MINUTE)} mins ago`
    } else if (diff < time.MILLISECONDS_PER_DAY) {
        return compareDate.toLocaleString("en-us", {
            minute: "numeric",
            hour: "numeric",
            hourCycle: "h12"
        })
    } else if (diff < time.MILLISECONDS_PER_YEAR) {
        return compareDate.toLocaleString("en-us", {
            day: "numeric",
            month: "short"
        })
    } else {
        return compareDate.toLocaleString("en-us", {
            day: "numeric",
            month: "short",
            year: "numeric"
        })
    }
}