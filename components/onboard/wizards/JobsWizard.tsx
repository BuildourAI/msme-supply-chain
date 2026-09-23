'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Chips, Field, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { addJob, DEFAULT_PREFIX, JOB_WORD, jobProblem, nextJobNo, setJobNumbering } from '@/lib/workspace/jobs'
import type { JobNumbering } from '@/lib/workspace/types'

const WORDS: { value: JobNumbering['word']; label: string; hint: string }[] = [
  { value: 'style', label: 'A style', hint: 'Garments — ST-4521, the style being cut and stitched' },
  { value: 'job', label: 'A job', hint: 'A job card or work order on the floor' },
  { value: 'order', label: "A customer's order", hint: 'Made to order — the order it is for' },
]

/**
 * What material leaves the store against.
 *
 * Two questions: what the owner calls it, and what the numbers look like —
 * because the slip should say ST-4521 if that is what the cutting master
 * says, not a number this build invented. The first one can be opened here
 * too, so the store's first issue has something to go against.
 */
export function JobsWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const [word, setWord] = useState<JobNumbering['word']>('style')
  const [prefix, setPrefix] = useState('ST')
  const [touched, setTouched] = useState(false)
  const [no, setNo] = useState('')
  const [name, setName] = useState('')
  const [customer, setCustomer] = useState('')

  useEffect(() => {
    if (!open || !workspace) return
    const n = workspace.jobNumbering
    setWord(n?.word ?? 'style'); setPrefix(n?.prefix ?? DEFAULT_PREFIX[n?.word ?? 'style'])
    setTouched(Boolean(n)); setNo(''); setName(''); setCustomer('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const numbering: JobNumbering = { word, prefix: prefix.trim() || DEFAULT_PREFIX[word] }
  const preview = nextJobNo(setJobNumbering(ws, numbering))
  const w = JOB_WORD[word]
  const firstNo = no.trim() || preview
  const opening = name.trim() !== '' || customer.trim() !== '' || no.trim() !== ''
  const firstProblem = opening
    ? jobProblem(setJobNumbering(ws, numbering), { no: firstNo, openedOn: today })
    : null

  const steps: WizardStep[] = [
    {
      label: 'Numbering',
      title: 'What does material leave the store against?',
      why: 'Every issue slip names one, so every metre that leaves is somebody’s — and what each one used is a sum, not a guess.',
      invalid: /^[A-Za-z0-9/]{1,8}$/.test(prefix.trim())
        ? null : 'Keep the prefix short — letters and numbers, up to eight.',
      body: (
        <div className="space-y-3.5">
          <Chips value={word} options={WORDS}
            onChange={(v) => {
              const next = v as JobNumbering['word']
              setWord(next)
              if (!touched) setPrefix(DEFAULT_PREFIX[next])
            }} />
          <p className="text-[12px] text-ink-3">{WORDS.find((x) => x.value === word)?.hint}</p>
          <Field label={`What do your ${w.one} numbers start with?`} htmlFor="jb-prefix"
            hint="Whatever is on the job card already. The next one counts up from the highest you have used.">
            <TextInput id="jb-prefix" value={prefix} autoFocus
              onChange={(v) => { setPrefix(v.toUpperCase()); setTouched(true) }} placeholder="ST" />
          </Field>
          <p className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12.5px] text-ink-2">
            Your next {w.one} will be <strong className="mono text-ink">{preview}</strong>.
          </p>
        </div>
      ),
    },
    {
      label: 'The first one',
      title: `Open your first ${w.one}?`,
      why: `Optional. Material can only be issued against an open ${w.one}, so opening one now means the store can issue today.`,
      invalid: firstProblem,
      body: (
        <div className="space-y-3.5">
          <Field label={`${w.one.charAt(0).toUpperCase()}${w.one.slice(1)} number`} htmlFor="jb-no">
            <TextInput id="jb-no" value={no} onChange={setNo} placeholder={preview} />
          </Field>
          <Field label="What it is" hint="Leave everything blank to skip." htmlFor="jb-name">
            <TextInput id="jb-name" value={name} onChange={setName} placeholder="Slim-fit jeans, 14 oz indigo" />
          </Field>
          <Field label="For" htmlFor="jb-customer">
            <TextInput id="jb-customer" value={customer} onChange={setCustomer} placeholder="The customer, if there is one" />
          </Field>
        </div>
      ),
    },
  ]

  const save = () => {
    update((w0) => {
      const w1 = setJobNumbering(w0, numbering)
      if (!opening) return w1
      return addJob(w1, { no: no.trim() || nextJobNo(w1), name, customer, openedOn: today })[0]
    })
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose} wide={false}
      title="Set up job numbers"
      steps={steps} onDone={save}
      doneLabel={opening ? `Save, and open ${firstNo}` : 'Save'} />
  )
}
