/**
 * A name no other test picks, in any browser or worker running at the same moment: the time, and
 * a few random letters. Each browser runs every test, often at once, against one database.
 */
export function unique(name: string): string {
  const random = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `${name}-${Date.now().toString(36)}${random}`;
}

/** An email address for a test's own account. */
export function uniqueEmail(name: string): string {
  return `${unique(name)}@example.com`;
}
