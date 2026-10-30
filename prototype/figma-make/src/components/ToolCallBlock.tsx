import type { ToolCall } from '@/types'
import { cn } from '@/lib/utils'

function formatValue(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(JSON.stringify(value))
}

/** Renders a ToolCall in function-call style, generated from the object. */
export function ToolCallBlock({ call, className }: { call: ToolCall; className?: string }) {
  const entries = Object.entries(call.args)
  return (
    <pre
      aria-label={`Tool call ${call.tool}`}
      className={cn(
        'bg-muted rounded-lg border px-3 py-3 font-mono text-xs leading-normal whitespace-pre-wrap break-words',
        className,
      )}
    >
      <code>
        <span className="font-semibold">{call.tool}</span>(
        {entries.length > 0 && '\n'}
        {entries.map(([key, value], i) => (
          <span key={key}>
            {'  '}
            <span className="text-muted-foreground">{key}:</span> {formatValue(value)}
            {i < entries.length - 1 ? ',' : ''}
            {'\n'}
          </span>
        ))}
        )
      </code>
    </pre>
  )
}
