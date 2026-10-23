import type { Register } from 'claude-code'

const PANE = 'vitals'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'vitals',
      description: 'Show or hide the claude-vitals sidebar: cache, context, usage, files and tasks',
    })
    return next(e)
  })

  on('command.run', { command: 'vitals' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Vitals' })
    return { text: 'Vitals sidebar opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>claude-vitals</Text>
  })
}
