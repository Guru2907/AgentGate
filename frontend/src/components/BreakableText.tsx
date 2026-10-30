import { Fragment } from 'react'

/** Lets long file, path and tool names wrap after '_', '.' or '/' instead of mid-word. */
export function BreakableText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(?<=[_./])/).map((part, i) => (
        <Fragment key={i}>
          {part}
          <wbr />
        </Fragment>
      ))}
    </>
  )
}
