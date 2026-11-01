/** عبور عبارت جست‌وجو از هدر به صفحه‌ی /search، مستقل از نوع Router (hash یا history). */
let pending = '';
export const setPendingSearch = (q: string) => { pending = q; };
export const consumePendingSearch = (): string => { const q = pending; pending = ''; return q; };
