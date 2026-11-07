import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Download, LogOut } from 'lucide-react'
import { useAuth, useProfile } from '../auth'
import { Button, Card, ErrorNote, PageHeader, SectionTitle } from '../components/ui'
import { listCardio, listDoneSets, listMeasurements, listRecords, listSessions, listWorkouts, loadLibrary } from '../lib/data'
import { isoDate } from '../lib/training'
import { supabase } from '../lib/supabase'

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

const csv = (rows: (string | number | null)[][]) =>
  rows.map((r) => r.map((v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n')

function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (on: boolean) => void; label: string; sub: string }) {
  return (
    <label className="flex items-start justify-between gap-4 py-3">
      <span><span className="block font-medium">{label}</span><span className="text-sm text-muted">{sub}</span></span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 accent-[var(--color-accent)]" />
    </label>
  )
}

export default function SettingsPage() {
  const { profile, patchProfile } = useProfile()
  const { session } = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function exportCsv() {
    setBusy('csv'); setError(null)
    try {
      const [lib, sets, sessions] = await Promise.all([loadLibrary(), listDoneSets(5000), listSessions(5000)])
      const names = new Map(sessions.map((s) => [s.id, s.name]))
      download(`roy-naliqk-workouts-${isoDate(new Date())}.csv`, csv([
        ['date', 'workout', 'exercise', 'planned_reps', 'planned_weight_kg', 'reps', 'weight_kg', 'volume_kg'],
        ...sets.map((s) => [s.date.slice(0, 10), names.get(s.session_id) ?? '', lib.byId.get(s.exercise_id)?.name ?? '', s.planned_reps, s.planned_weight, s.reps, s.weight, s.reps * s.weight]),
      ]), 'text/csv')
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  async function exportJson() {
    setBusy('json'); setError(null)
    try {
      const [sets, sessions, workouts, records, cardio, measurements] = await Promise.all([listDoneSets(5000), listSessions(5000), listWorkouts(), listRecords(), listCardio(), listMeasurements()])
      download(`roy-naliqk-report-${isoDate(new Date())}.json`, JSON.stringify({ exported_at: new Date().toISOString(), profile, sessions, sets, workouts, personal_records: records, cardio, measurements }, null, 2), 'application/json')
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  async function signOut() {
    await supabase.auth.signOut()
    nav('/login', { replace: true })
  }

  const toggle = (k: 'notify_workouts' | 'notify_coach', on: boolean) => patchProfile({ [k]: on }).catch((err) => setError(err.message))

  return (
    <div className="animate-rise max-w-3xl">
      <PageHeader eyebrow={session?.user.email} title="Settings" />
      <ErrorNote error={error} />
      <Card className="mt-4 p-5">
        <SectionTitle>Notifications</SectionTitle>
        <div className="divide-y divide-line/60">
          <Toggle checked={profile.notify_workouts} onChange={(on) => toggle('notify_workouts', on)} label="Missed-workout reminders" sub="Show a dashboard reminder when you fall behind this week’s planned sessions." />
          <Toggle checked={profile.notify_coach} onChange={(on) => toggle('notify_coach', on)} label="Coach updates" sub="Show a dashboard alert when the coach has open recommendations." />
        </div>
      </Card>
      <Card className="mt-4 p-5">
        <SectionTitle>Export your data</SectionTitle>
        <p className="mb-4 text-sm text-muted">Your data is yours. Download every logged set as a spreadsheet, or a full report of workouts, records, cardio and measurements.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportCsv} busy={busy === 'csv'}><Download className="size-4" /> Workout history (CSV)</Button>
          <Button onClick={exportJson} busy={busy === 'json'}><Download className="size-4" /> Performance report (JSON)</Button>
        </div>
      </Card>
      <Card className="mt-4 p-5">
        <SectionTitle>Session</SectionTitle>
        <Button variant="danger" onClick={signOut}><LogOut className="size-4" /> Sign out</Button>
      </Card>
    </div>
  )
}
