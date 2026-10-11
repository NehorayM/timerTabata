import { memo } from 'react'

// Material Design icons (Apache-2.0, @material-design-icons/svg), inlined at build time.

import walk from '@material-design-icons/svg/filled/directions_walk.svg?raw'
import work from '@material-design-icons/svg/filled/fitness_center.svg?raw'
import rest from '@material-design-icons/svg/filled/accessibility.svg?raw'
import timer from '@material-design-icons/svg/outlined/timer.svg?raw'
import repeat from '@material-design-icons/svg/filled/repeat.svg?raw'
import sets from '@material-design-icons/svg/filled/update.svg?raw'
import seat from '@material-design-icons/svg/filled/event_seat.svg?raw'
import sofa from '@material-design-icons/svg/filled/weekend.svg?raw'
import list from '@material-design-icons/svg/round/storage.svg?raw'
import play from '@material-design-icons/svg/filled/play_arrow.svg?raw'
import add from '@material-design-icons/svg/filled/add.svg?raw'
import addCircle from '@material-design-icons/svg/filled/add_circle.svg?raw'
import removeCircle from '@material-design-icons/svg/filled/remove_circle.svg?raw'
import image from '@material-design-icons/svg/filled/image.svg?raw'
import hideImage from '@material-design-icons/svg/filled/hide_image.svg?raw'
import eye from '@material-design-icons/svg/filled/visibility.svg?raw'
import history from '@material-design-icons/svg/filled/history.svg?raw'
import settings from '@material-design-icons/svg/filled/settings.svg?raw'
import search from '@material-design-icons/svg/filled/search.svg?raw'
import filter from '@material-design-icons/svg/filled/filter_list.svg?raw'
import more from '@material-design-icons/svg/filled/more_vert.svg?raw'
import edit from '@material-design-icons/svg/filled/edit.svg?raw'
import notes from '@material-design-icons/svg/filled/assignment.svg?raw'
import star from '@material-design-icons/svg/filled/star.svg?raw'
import starBorder from '@material-design-icons/svg/filled/star_border.svg?raw'
import copy from '@material-design-icons/svg/filled/file_copy.svg?raw'
import share from '@material-design-icons/svg/filled/share.svg?raw'
import touch from '@material-design-icons/svg/filled/touch_app.svg?raw'
import deleteIcon from '@material-design-icons/svg/filled/delete.svg?raw'
import lockOpen from '@material-design-icons/svg/outlined/lock_open.svg?raw'
import lock from '@material-design-icons/svg/outlined/lock.svg?raw'
import pause from '@material-design-icons/svg/round/pause.svg?raw'
import prev from '@material-design-icons/svg/filled/skip_previous.svg?raw'
import next from '@material-design-icons/svg/filled/skip_next.svg?raw'
import back from '@material-design-icons/svg/filled/arrow_back.svg?raw'
import save from '@material-design-icons/svg/filled/save.svg?raw'
import close from '@material-design-icons/svg/filled/close.svg?raw'
import mini from '@material-design-icons/svg/filled/picture_in_picture_alt.svg?raw'
import pin from '@material-design-icons/svg/filled/push_pin.svg?raw'
import stop from '@material-design-icons/svg/filled/stop.svg?raw'
import replay from '@material-design-icons/svg/filled/replay.svg?raw'
import openFull from '@material-design-icons/svg/filled/open_in_full.svg?raw'
import upload from '@material-design-icons/svg/filled/file_upload.svg?raw'
import check from '@material-design-icons/svg/filled/check.svg?raw'
import up from '@material-design-icons/svg/filled/keyboard_arrow_up.svg?raw'
import folder from '@material-design-icons/svg/filled/folder_open.svg?raw'
import volume from '@material-design-icons/svg/filled/volume_up.svg?raw'

const ICONS = {
  walk,
  work,
  rest,
  timer,
  repeat,
  sets,
  seat,
  sofa,
  list,
  play,
  add,
  addCircle,
  removeCircle,
  image,
  hideImage,
  eye,
  history,
  settings,
  search,
  filter,
  more,
  edit,
  notes,
  star,
  starBorder,
  copy,
  share,
  touch,
  delete: deleteIcon,
  lockOpen,
  lock,
  pause,
  prev,
  next,
  back,
  save,
  close,
  mini,
  pin,
  stop,
  replay,
  openFull,
  upload,
  check,
  up,
  folder,
  volume
}

export type IconName = keyof typeof ICONS

// Stable objects: React 19 re-assigns innerHTML whenever this prop's identity changes,
// which would replace the <svg> mid-click and swallow the click event.
const HTML = Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [k, { __html: v }])) as Record<IconName, { __html: string }>

export const Icon = memo(function Icon({ name, className }: { name: IconName; className?: string }): React.JSX.Element {
  return <span className={`icon ${className ?? ''}`} aria-hidden="true" dangerouslySetInnerHTML={HTML[name]} />
})
