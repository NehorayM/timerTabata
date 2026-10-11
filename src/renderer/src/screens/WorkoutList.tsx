import { useMemo, useRef, useState } from 'react'
import type { Settings, SortKey, Workout } from '../../../shared/types'
import { cardLines, totalLine, workoutTotals } from '../../../shared/workout'
import { Icon } from '../components/Icon'
import { IconButton, PopupMenu, type MenuItem } from '../components/ui'

export interface CardActions {
  edit(w: Workout): void
  preview(w: Workout): void
  settings(w: Workout): void
  notes(w: Workout): void
  favorite(w: Workout): void
  copy(w: Workout): void
  share(w: Workout): void
  shortcut(w: Workout): void
  remove(w: Workout): void
  start(w: Workout): void
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'updated', label: 'Recently edited' },
  { key: 'used', label: 'Recently used' },
  { key: 'created', label: 'Newest first' },
  { key: 'name', label: 'Name' },
  { key: 'duration', label: 'Total duration' }
]

export function sortWorkouts(list: Workout[], sort: SortKey): Workout[] {
  const out = [...list]
  const dur = new Map(out.map((w) => [w.id, workoutTotals(w).seconds]))
  out.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name) || b.updatedAt - a.updatedAt
      case 'duration':
        return dur.get(a.id)! - dur.get(b.id)!
      case 'created':
        return b.createdAt - a.createdAt
      case 'used':
        return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || b.updatedAt - a.updatedAt
      default:
        return b.updatedAt - a.updatedAt
    }
  })
  return out
}

export function WorkoutList({
  workouts,
  settings,
  actions,
  onBack,
  onSettings,
  onCreate,
  onImport,
  onSortChange
}: {
  workouts: Workout[]
  settings: Settings
  actions: CardActions
  onBack: (() => void) | null
  onSettings: () => void
  onCreate: () => void
  onImport: () => void
  onSortChange: (patch: Partial<Pick<Settings, 'sort' | 'favoritesOnly'>>) => void
}): React.JSX.Element {
  const [query, setQuery] = useState<string | null>(null)
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null)

  const visible = useMemo(() => {
    const q = (query ?? '').trim().toLocaleLowerCase()
    const filtered = workouts.filter(
      (w) =>
        (!settings.favoritesOnly || w.favorite) &&
        (!q || [w.name, w.workDescription, w.restDescription, w.notes].some((t) => t.toLocaleLowerCase().includes(q)))
    )
    return sortWorkouts(filtered, settings.sort)
  }, [workouts, query, settings.sort, settings.favoritesOnly])

  const filterItems: MenuItem[] = [
    ...SORTS.map((s) => ({
      label: `Sort: ${s.label}`,
      role: 'menuitemradio' as const,
      checked: settings.sort === s.key,
      onSelect: () => onSortChange({ sort: s.key })
    })),
    {
      label: 'Favorites only',
      role: 'menuitemcheckbox',
      checked: settings.favoritesOnly,
      onSelect: () => onSortChange({ favoritesOnly: !settings.favoritesOnly })
    }
  ]

  const filtering = settings.favoritesOnly || !!query?.trim()

  return (
    <div className="screen list-screen">
      <header className="toolbar list-toolbar">
        {onBack ? <IconButton icon="back" label="Back to editor" onClick={onBack} /> : <span className="toolbar-gap" />}
        {query === null ? (
          <h1 className="toolbar-title">Workouts: {visible.length}</h1>
        ) : (
          <input
            className="search-input"
            autoFocus
            dir="auto"
            placeholder="Search workouts"
            aria-label="Search workouts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery(null)}
          />
        )}
        <div className="toolbar-actions">
          <IconButton
            icon={query === null ? 'search' : 'close'}
            label={query === null ? 'Search' : 'Close search'}
            onClick={() => setQuery(query === null ? '' : null)}
          />
          <IconButton
            icon="filter"
            label="Filter and sort"
            className={settings.favoritesOnly ? 'active-filter' : ''}
            onClick={(e) => setFilterAnchor(filterAnchor ? null : e.currentTarget)}
          />
          <IconButton icon="settings" label="Settings" onClick={onSettings} />
        </div>
      </header>
      {filterAnchor && <PopupMenu label="Filter and sort" anchor={filterAnchor} items={filterItems} onClose={() => setFilterAnchor(null)} />}
      <main className="list-body">
        {workouts.length === 0 ? (
          <div className="empty-state">
            <Icon name="work" className="empty-icon" />
            <h2>No workouts yet</h2>
            <p>Create your first interval workout or import a shared one.</p>
            <div className="empty-actions">
              <button className="filled-btn" onClick={onCreate}>
                <Icon name="add" /> Create workout
              </button>
              <button className="outline-btn" onClick={onImport}>
                <Icon name="upload" /> Import workout
              </button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <h2>No matching workouts</h2>
            <p>{filtering ? 'Try a different search or clear the favorites filter.' : ''}</p>
          </div>
        ) : (
          <ul className="cards" aria-label="Workouts">
            {visible.map((w) => (
              <WorkoutCard key={w.id} w={w} actions={actions} />
            ))}
          </ul>
        )}
      </main>
      <button className="fab" aria-label="New workout" title="New workout" onClick={onCreate}>
        <Icon name="add" />
      </button>
    </div>
  )
}

function WorkoutCard({ w, actions }: { w: Workout; actions: CardActions }): React.JSX.Element {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const items: MenuItem[] = [
    { label: 'Edit', icon: 'edit', onSelect: () => actions.edit(w) },
    { label: 'Preview', icon: 'eye', onSelect: () => actions.preview(w) },
    { label: 'Settings', icon: 'settings', onSelect: () => actions.settings(w) },
    { label: 'Notes', icon: 'notes', onSelect: () => actions.notes(w) },
    { label: w.favorite ? 'Unfavorite' : 'Favorite', icon: w.favorite ? 'star' : 'starBorder', onSelect: () => actions.favorite(w) },
    { label: 'Copy', icon: 'copy', onSelect: () => actions.copy(w) },
    { label: 'Share', icon: 'share', onSelect: () => actions.share(w) },
    { label: 'Create shortcut', icon: 'touch', onSelect: () => actions.shortcut(w) },
    { label: 'Delete', icon: 'delete', onSelect: () => actions.remove(w) }
  ]
  return (
    <li className="card" style={{ background: w.color }} data-testid="workout-card">
      <div className="card-head">
        <button className="card-title" onClick={() => actions.edit(w)} aria-label={`Edit ${w.name}`}>
          <bdi>{w.name}</bdi>
          {w.favorite && <Icon name="star" className="fav-star" />}
        </button>
        <IconButton icon="play" label={`Start ${w.name}`} onClick={() => actions.start(w)} />
        <button
          ref={moreRef}
          className="icon-btn"
          aria-label={`More actions for ${w.name}`}
          title="More actions"
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onClick={(e) => setMenu(menu ? null : e.currentTarget)}
        >
          <Icon name="more" />
        </button>
      </div>
      <div className="card-body" onClick={() => actions.edit(w)}>
        {cardLines(w).map((l) => (
          <div className="card-line" key={l.label}>
            {l.label}: {l.value}
            {l.description && (
              <>
                {' • '}
                <bdi className="desc">{l.description}</bdi>
              </>
            )}
          </div>
        ))}
        <div className="card-line">{totalLine(w)}</div>
      </div>
      {menu && <PopupMenu label={`${w.name} actions`} anchor={menu} items={items} onClose={() => setMenu(null)} />}
    </li>
  )
}
