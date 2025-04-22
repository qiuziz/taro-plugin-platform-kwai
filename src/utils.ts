export function indent (str: string, size: number): string {
  return str.split('\n')
    .map((line, index) => {
      const indent = index === 0 ? '' : Array(size).fill(' ').join('')
      return indent + line
    })
    .join('\n')
}