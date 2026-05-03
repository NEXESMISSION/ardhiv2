/**
 * Replace variables in a string template
 * Example: replaceVars("Hello {{name}}", { name: "World" }) => "Hello World"
 */
export function replaceVars(str: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)), str)
}
