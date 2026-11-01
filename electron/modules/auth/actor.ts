import { AsyncLocalStorage } from 'async_hooks'

/**
 * Usuario que originó la operación en curso. Lo fija el control de acceso al
 * atender cada pedido de la pantalla y acompaña a todo lo que ese pedido haga,
 * aunque espere (p. ej. a AFIP). Lo que el sistema hace por su cuenta — la
 * sincronización periódica con la web — no tiene usuario: queda NULL.
 */
const storage = new AsyncLocalStorage<number | null>()

export function runAsActor<T>(userId: number | null, fn: () => T): T {
  return storage.run(userId, fn)
}

/** Para operaciones del sistema dentro de un pedido de usuario (no se le atribuyen). */
export function runAsSystem<T>(fn: () => T): T {
  return storage.run(null, fn)
}

export function currentActorId(): number | null {
  return storage.getStore() ?? null
}
