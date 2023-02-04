type Id = number

type ListenerRecord<Listener extends Function> = {callback: Listener, id: Id}

export class EventListenerRecord<
    Listener extends Function
> {
    private listenerRecords: ListenerRecord<Listener>[] = []
    private listenerMap: Map<Listener, Id> = new Map()
    private idCounter = 0

    private createNewId(): Id {
        return this.idCounter++
    }

    getAll(): ReadonlyArray<Listener> {
        return this.listenerRecords.map(
            (record) => record.callback
        )
    }

    addEventListener(listener: Listener): void {
        const id = this.createNewId()
        const record = {id, callback: listener}
        this.listenerRecords.push(record)
        this.listenerMap.set(listener, id)
    }

    removeEventListener(listener: Listener): void {
        if (!this.listenerMap.has(listener)) {
            return
        }
        const id = this.listenerMap.get(listener) || 0
        const index = this.listenerRecords.findIndex(
            (record) => record.id === id
        )
        if (index < 0) {
            return
        }
        this.listenerRecords.splice(index, 1)
        this.listenerMap.delete(listener)
    }
}