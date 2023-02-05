type Id = number

type ListenerRecord<Listener extends Function> = {callback: Listener, id: Id}

export class EventListenerRecord<
    Listener extends Function
> {
    private listenerRecords: ListenerRecord<Listener>[] = []
    private idCounter = 0

    private createNewId(): Id {
        return this.idCounter++
    }

    getAll(): ReadonlyArray<Listener> {
        return this.listenerRecords.map(
            (record) => record.callback
        )
    }

    addEventListener(listener: Listener): number {
        const id = this.createNewId()
        const record = {id, callback: listener}
        this.listenerRecords.push(record)
        return id
    }

    removeEventListener(id: Id): boolean {
        if (this.listenerRecords.length < 1) {
            return false
        }
        const index = this.listenerRecords.findIndex(
            (record) => record.id === id
        )
        if (index < 0) {
            return false
        }
        this.listenerRecords.splice(index, 1)
        return true
    }
}