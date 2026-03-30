import { uIOhook } from 'uiohook-napi'
import { writeFileSync } from 'fs'

const events = []
const startTime = Date.now()

uIOhook.on('mousemove', (e) => {
  events.push({ type: 'move', x: e.x, y: e.y, t: Date.now() - startTime })
})

uIOhook.on('mousedown', (e) => {
  events.push({ type: 'down', x: e.x, y: e.y, button: e.button, t: Date.now() - startTime })
})

uIOhook.on('mouseup', (e) => {
  events.push({ type: 'up', x: e.x, y: e.y, button: e.button, t: Date.now() - startTime })
})

uIOhook.on('wheel', (e) => {
  events.push({ type: 'scroll', x: e.x, y: e.y, rotation: e.rotation, t: Date.now() - startTime })
})

console.log('Starting cursor capture for 5 seconds... Move your mouse and click!')
uIOhook.start()

setTimeout(() => {
  uIOhook.stop()
  console.log(`\nCaptured ${events.length} events in 5 seconds`)

  if (events.length > 0) {
    console.log('\nFirst 5 events:')
    console.log(JSON.stringify(events.slice(0, 5), null, 2))

    console.log('\nEvent type breakdown:')
    const counts = {}
    for (const e of events) { counts[e.type] = (counts[e.type] || 0) + 1 }
    console.log(counts)

    // Calculate event rate
    const durationSec = (events[events.length - 1].t - events[0].t) / 1000
    console.log(`\nEvent rate: ${(events.length / durationSec).toFixed(1)} events/sec`)

    // Write NDJSON output
    const lines = events.map(e => JSON.stringify(e)).join('\n')
    writeFileSync('spikes/cursor-capture-spike-output.ndjson', lines)
    console.log(`\nWrote ${events.length} events to spikes/cursor-capture-spike-output.ndjson`)
  } else {
    console.log('NO EVENTS CAPTURED - uiohook may not have permission or X11 support issue')
  }

  process.exit(0)
}, 5000)
