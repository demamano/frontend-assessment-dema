// Data generator — excluded from the 300-line budget per the brief.
export type Status = 'NEW' | 'PICKING' | 'SHIPPED' | 'CANCELLED';

export interface Order {
  id: string;
  orderNumber: string;
  customer: string;
  status: Status;
  total: number;
  date: string; // ISO yyyy-mm-dd
}

export const STATUSES: Status[] = ['NEW', 'PICKING', 'SHIPPED', 'CANCELLED'];

// Deterministic PRNG so every reload (and the reviewer's machine) sees identical data.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Anna', 'Bjorn', 'Carlos', 'Dana', 'Elif', 'Farah', 'Georg', 'Hana', 'Ivan', 'Julia', 'Kofi', 'Lena', 'Marco', 'Nadia', 'Omar', 'Priya', 'Rosa', 'Sven', 'Tara', 'Yusuf'];
const LAST = ['Andersson', 'Berg', 'Costa', 'Dimitrov', 'Eriksson', 'Fischer', 'Garcia', 'Haddad', 'Ito', 'Jansen', 'Kim', 'Lindqvist', 'Meyer', 'Novak', 'Okafor', 'Petrov', 'Rossi', 'Silva', 'Tanaka', 'Weber'];

export function generateOrders(count = 5000): Order[] {
  const rand = mulberry32(20260818);
  const orders: Order[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const day = new Date(Date.UTC(2026, 0, 1 + Math.floor(rand() * 230)));
    orders[i] = {
      id: String(i),
      orderNumber: `ORD-${100000 + i}`,
      customer: `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`,
      status: STATUSES[Math.floor(rand() * STATUSES.length)],
      total: Math.round(rand() * 99900 + 100) / 100,
      date: day.toISOString().slice(0, 10),
    };
  }
  return orders;
}

export const ORDERS = generateOrders();
