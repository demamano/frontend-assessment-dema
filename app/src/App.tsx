import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ORDERS, STATUSES, type Order, type Status } from './data';
import { setSearchParam, useSearchParam } from './urlState';

declare global {
  interface Window { __rowRenders: number }
}
window.__rowRenders = 0; // render-count proof for constraint 2 — see evidence/

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const OrderRow = memo(function OrderRow({ order, selected, onActivate, rowRef }: {
  order: Order;
  selected: boolean;
  onActivate: (id: string) => void;
  rowRef: (id: string, el: HTMLTableRowElement | null) => void;
}) {
  // oxlint-disable-next-line react/immutability -- deliberate dev instrumentation, see evidence/
  window.__rowRenders++;
  return (
    <tr
      ref={(el) => rowRef(order.id, el)}
      tabIndex={selected ? 0 : -1}
      aria-current={selected ? 'true' : undefined}
      className={selected ? 'selected' : undefined}
      onClick={() => onActivate(order.id)}
    >
      <td>{order.orderNumber}</td>
      <td>{order.customer}</td>
      <td><span className={`badge ${order.status}`}>{order.status}</span></td>
      <td className="num">{money.format(order.total)}</td>
      <td>{order.date}</td>
    </tr>
  );
});

// Module-level so its identity is stable: React then calls it on mount only.
const focusOnMount = (el: HTMLButtonElement | null) => el?.focus();

function DetailPanel({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <aside className="panel no-print" role="dialog" aria-label={`Order ${order.orderNumber} details`}>
      <header>
        <h2>{order.orderNumber}</h2>
        <button ref={focusOnMount} onClick={onClose} aria-label="Close details">✕</button>
      </header>
      <dl>
        <dt>Customer</dt><dd>{order.customer}</dd>
        <dt>Status</dt><dd><span className={`badge ${order.status}`}>{order.status}</span></dd>
        <dt>Total</dt><dd>{money.format(order.total)}</dd>
        <dt>Date</dt><dd>{order.date}</dd>
      </dl>
    </aside>
  );
}

export default function App() {
  const q = useSearchParam('q');
  const statusParam = useSearchParam('status');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const rowEls = useRef(new Map<string, HTMLTableRowElement>());
  const wrapEl = useRef<HTMLDivElement>(null);

  const statuses = useMemo(
    () => new Set(statusParam ? (statusParam.split(',') as Status[]) : []),
    [statusParam],
  );
  const filtered = useMemo(() => {
    const needle = q.toUpperCase();
    return ORDERS.filter(
      (o) =>
        (!needle || o.orderNumber.includes(needle)) &&
        (statuses.size === 0 || statuses.has(o.status)),
    );
  }, [q, statuses]);

  const rowRef = useCallback((id: string, el: HTMLTableRowElement | null) => {
    if (el) rowEls.current.set(id, el);
    else rowEls.current.delete(id);
  }, []);
  const activate = useCallback((id: string) => {
    setSelectedId(id);
    setOpenId(id);
  }, []);

  const toggleStatus = (s: Status) => {
    const next = new Set(statuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setSearchParam('status', [...next].join(','), 'push');
  };

  const close = () => {
    // focus back to the row that was open (or the list, if filters removed it)
    if (openId) (rowEls.current.get(openId) ?? wrapEl.current)?.focus();
    setOpenId(null);
  };

  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && openId) {
      e.preventDefault();
      close();
    }
  };

  const onTableKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (selectedId) {
        e.preventDefault();
        setOpenId(selectedId);
      }
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const idx = filtered.findIndex((o) => o.id === selectedId);
    const next = filtered[e.key === 'ArrowDown' ? Math.min(idx + 1, filtered.length - 1) : Math.max(idx - 1, 0)];
    if (next) {
      setSelectedId(next.id);
      const el = rowEls.current.get(next.id);
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    }
  };

  const openOrder = openId ? ORDERS.find((o) => o.id === openId) : undefined;

  return (
    <div className="app" onKeyDown={onEscape}>
      <header className="controls no-print">
        <h1>Orders</h1>
        <input
          type="search"
          placeholder="Search order number…"
          aria-label="Search by order number"
          value={q}
          onChange={(e) => setSearchParam('q', e.target.value, 'replace')}
        />
        <fieldset>
          <legend>Status</legend>
          {STATUSES.map((s) => (
            <label key={s}>
              <input type="checkbox" checked={statuses.has(s)} onChange={() => toggleStatus(s)} />
              {s}
            </label>
          ))}
        </fieldset>
        <span className="count">{filtered.length} of {ORDERS.length} orders</span>
      </header>
      <div className="tableWrap" ref={wrapEl} role="region" tabIndex={0} onKeyDown={onTableKeyDown} aria-label="Order list">
        <table>
          <thead>
            <tr><th>Order #</th><th>Customer</th><th>Status</th><th className="num">Total</th><th>Date</th></tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <OrderRow key={o.id} order={o} selected={o.id === selectedId} onActivate={activate} rowRef={rowRef} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="empty">No orders match the current filters.</p>}
      </div>
      {openOrder && <DetailPanel order={openOrder} onClose={close} />}
    </div>
  );
}
