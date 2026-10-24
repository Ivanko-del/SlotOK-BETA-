const nf = new Intl.NumberFormat('uk-UA');

export function formatNumber(n: number): string {
  return nf.format(Math.round(n));
}
