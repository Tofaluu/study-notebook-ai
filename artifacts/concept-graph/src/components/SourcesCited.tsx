import type { PageReference } from '@workspace/api-client-react';

// The lecture pages an answer drew from, as a plain list under the answer.
export function SourcesCited({ refs }: { refs?: PageReference[] }) {
  if (!refs || refs.length === 0) return null;
  return (
    <section className="mt-10 border-t border-border/60 pt-6">
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Sources cited</h3>
      <ul className="divide-y divide-border/60">
        {refs.map((ref, i) => (
          <li key={i} className="py-3 text-sm">
            <p className="font-semibold text-foreground">
              <span className="line-clamp-1" title={ref.sourceName}>
                {ref.sourceName}
                <span className="ml-2 font-normal text-muted-foreground">p. {ref.pageNumber}</span>
              </span>
            </p>
            <p className="mt-1 line-clamp-2 font-serif italic leading-relaxed text-muted-foreground">“{ref.excerpt}”</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
