/**
 * Helper function to handle Supabase embeds that can be either objects or arrays.
 * For one-to-one relationships, Supabase returns an object.
 * For one-to-many relationships, Supabase returns an array.
 * This function normalizes both cases to return the first item or the object itself.
 */
export function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

