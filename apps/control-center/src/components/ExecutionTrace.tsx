import { Bot, Box, Check, CircleDashed, PlugZap, Shield, Wrench } from 'lucide-react';
import type { TraceItem } from '../types';

const icons = {
  harness: Shield,
  connector: PlugZap,
  sandbox: Box,
  subagent: Bot,
  tool: Wrench,
};

export function ExecutionTrace({ items }: { items: TraceItem[] }) {
  return (
    <section className="trace-panel" aria-labelledby="trace-title">
      <div className="section-heading">
        <div>
          <span>LIVE EXECUTION</span>
          <h2 id="trace-title">Agent trace</h2>
        </div>
        <div className="live-indicator"><i /> streaming</div>
      </div>

      <div className="trace-list" aria-live="polite">
        {items.length === 0 ? (
          <div className="trace-empty">
            <CircleDashed size={30} />
            <p>The harness trace will appear here.</p>
            <span>MCP calls, subagents, sandbox execution and approvals remain visible.</span>
          </div>
        ) : (
          items.map((item) => {
            const Icon = icons[item.category];
            return (
              <article className={`trace-item state-${item.state}`} key={item.id}>
                <div className="trace-icon"><Icon size={16} /></div>
                <div className="trace-copy">
                  <strong>{item.title}</strong>
                  {item.detail && <p>{item.detail}</p>}
                </div>
                <div className="trace-state">
                  {item.state === 'done' ? <Check size={14} /> : <span />}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
