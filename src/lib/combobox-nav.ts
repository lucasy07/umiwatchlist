/**
 * Próximo índice ativo de um combobox ao navegar com as setas, com volta circular.
 * `current` −1 significa nenhuma opção ativa; lista vazia devolve −1.
 */
export function moveActiveIndex(current: number, delta: 1 | -1, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : length - 1;
  return (current + delta + length) % length;
}
