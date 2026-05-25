import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RealmState } from '../../../rules/state'
import { supabase } from '../../../lib/supabase'
import { saveRealm } from '../../../lib/realmIo'
import {
  MINISTER_ROLES,
  MINISTER_ROLE_DESCRIPTION,
  MINISTER_ROLE_LABEL,
  annualMinisterCost,
  executeRecruitMinister,
  findMinisterByRole,
  recruitMinisterCost,
} from '../../../rules/actions/ministers'
import type { MinisterRole } from '../../../rules/actions/ministers'
import { queryKeys } from '../../../hooks/queryKeys'

interface Props {
  realm: RealmState
  realmId: string
  onClose: () => void
}

export function RecruitMinistersPanel({ realm, realmId, onClose }: Props) {
  const [role, setRole] = useState<MinisterRole>('treasurer')
  const [name, setName] = useState('')
  const [level, setLevel] = useState<number>(3)
  const queryClient = useQueryClient()

  const recruit = useMutation({
    mutationFn: async () => {
      const cached = queryClient.getQueryData<RealmState>(queryKeys.realms.detail(realmId))
      if (!cached) throw new Error('Realm not loaded')
      const { state } = executeRecruitMinister(cached, { role, name, level })
      queryClient.setQueryData(queryKeys.realms.detail(realmId), state)
      await saveRealm(supabase, state)
      return state
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.realms.detail(realmId) })
    },
  })

  const previous = findMinisterByRole(realm.ministers, role)
  const cost = recruitMinisterCost(level, realm.season)
  const annual = annualMinisterCost({
    id: '',
    role,
    name: '',
    level,
    hiredYear: realm.year,
    hiredSeason: realm.season,
  })
  const offSeason = realm.season !== 'spring'
  const insufficientGold = realm.resources.gold < cost
  const invalidLevel = !Number.isInteger(level) || level < 1 || level > 20
  const canSubmit = !insufficientGold && !invalidLevel && !recruit.isPending

  const submit = async () => {
    try {
      await recruit.mutateAsync()
      onClose()
    } catch {
      /* error surfaced via recruit.error */
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg shadow-xl max-w-lg w-full flex flex-col">
        <header className="px-5 py-4 border-b border-stone-200 dark:border-stone-800">
          <h3 className="font-serif font-semibold text-xl mb-1">Recruit Minister</h3>
          <p className="text-sm text-stone-500">
            Pay 1 gp per 3 minister levels. Each year you must pay the same as ongoing stipend
            or the minister resigns. Vacant roles incur a -2 penalty when the ruler covers them.
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          <fieldset>
            <legend className="text-sm font-medium mb-1.5">Role</legend>
            <div className="grid grid-cols-3 gap-2">
              {MINISTER_ROLES.map((r) => {
                const filled = findMinisterByRole(realm.ministers, r)
                return (
                  <label
                    key={r}
                    className={`border rounded-md px-2 py-2 text-center text-sm cursor-pointer transition-colors ${
                      role === r
                        ? 'border-stone-900 dark:border-stone-100 bg-stone-100 dark:bg-stone-800'
                        : 'border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r}
                      checked={role === r}
                      onChange={() => setRole(r)}
                      className="sr-only"
                    />
                    <div className="font-medium">{MINISTER_ROLE_LABEL[r]}</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {filled ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          Filled — will replace
                        </span>
                      ) : (
                        'Vacant'
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-stone-500 mt-2">{MINISTER_ROLE_DESCRIPTION[role]}</p>
          </fieldset>

          {previous && (
            <div className="text-xs text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
              Recruiting will dismiss <strong>{previous.name}</strong> (level {previous.level})
              and remove their loyalty group.
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`(default: ${MINISTER_ROLE_LABEL[role]} of ${realm.name})`}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Level</span>
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={level}
              onChange={(e) => setLevel(Math.floor(Number(e.target.value)) || 1)}
              className="mt-1 block w-full rounded-md border border-stone-300 dark:border-stone-700 bg-transparent px-3 py-2"
            />
            <span className="text-xs text-stone-500 mt-1 block">
              Higher level = bigger bonus on related checks (and bigger annual stipend).
            </span>
          </label>

          <div className="border-t border-stone-200 dark:border-stone-800 pt-3 text-sm space-y-1">
            <div>
              Recruit cost: <strong>{cost} gold</strong>
              {offSeason && <span className="text-stone-500"> (+1 off-season)</span>}
            </div>
            <div className="text-xs text-stone-500">
              Then <strong>{annual} gold</strong>/year as ongoing stipend.
            </div>
          </div>

          {invalidLevel && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              Level must be a whole number between 1 and 20.
            </p>
          )}
          {insufficientGold && !invalidLevel && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              Not enough gold (need {cost}, have {realm.resources.gold}).
            </p>
          )}
          {recruit.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {recruit.error.message}
            </p>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-stone-200 dark:border-stone-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-stone-300 dark:border-stone-700 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
          >
            {recruit.isPending ? 'Recruiting…' : previous ? 'Replace' : 'Recruit'}
          </button>
        </footer>
      </div>
    </div>
  )
}
