import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAction, createSession, settleSession } from '../../src/game/session.js'
import { activateReady, chooseIncoming, chooseOutgoing, completeSubstitution, createSubstitutionPlan, reconcileCourtOrder, reconcilePlan } from '../../src/game/substitutions.js'

const roster = Array.from({ length: 12 }, (_, id) => ({ id, starter: id < 5 }))
const stateOf = (session, id) => session.players.find((player) => player.id === id)
const courtIds = (session) => session.players.filter((player) => player.isOnCourt).map((player) => player.id)
const start = () => applyAction(createSession(roster), { type: 'clock' }, 1000)

test('two incoming players can wait without changing minutes, then enter in separate matched swaps', () => {
  let session = start()
  let plan = createSubstitutionPlan()
  let order = courtIds(session)
  for (const id of [5, 6]) {
    const choice = chooseIncoming(plan, id, session.players)
    assert.equal(choice.action, undefined)
    plan = choice.plan
  }
  assert.deepEqual(plan.readyIds, [5, 6])
  assert.deepEqual(courtIds(session), [0, 1, 2, 3, 4])
  session = settleSession(session, 5000)
  assert.equal(stateOf(session, 5).totalMs, 0)
  assert.equal(stateOf(session, 6).totalMs, 0)

  let choice = chooseOutgoing(plan, 1, session.players)
  session = applyAction(session, choice.action, 5000)
  plan = completeSubstitution(choice.plan, choice.action.playerId)
  order = reconcileCourtOrder(order, session.players)
  assert.deepEqual(order, [0, 5, 2, 3, 4])
  assert.deepEqual(plan.readyIds, [6])
  assert.equal(stateOf(session, 1).totalMs, 4000)

  choice = chooseOutgoing(plan, 3, session.players)
  session = applyAction(session, choice.action, 7500)
  plan = completeSubstitution(choice.plan, choice.action.playerId)
  order = reconcileCourtOrder(order, session.players)
  assert.deepEqual(order, [0, 5, 2, 6, 4])
  assert.equal(stateOf(session, 5).totalMs, 2500)
  assert.equal(stateOf(session, 3).totalMs, 6500)
  assert.equal(stateOf(session, 6).totalMs, 0)
  assert.equal(courtIds(session).length, 5)
  assert.deepEqual(plan, createSubstitutionPlan())
})

test('a coach can change the incoming order without losing the other ready players', () => {
  let session = start()
  let plan = createSubstitutionPlan()
  for (const id of [5, 6]) plan = chooseIncoming(plan, id, session.players).plan
  plan = activateReady(plan, 6)
  const choice = chooseOutgoing(plan, 2, session.players)
  assert.equal(choice.action.playerId, 6)
  session = applyAction(session, choice.action, 3000)
  plan = completeSubstitution(plan, 6)
  assert.deepEqual(plan.readyIds, [5])
  assert.equal(plan.activeId, 5)
  assert.equal(stateOf(session, 6).isOnCourt, true)
  assert.equal(stateOf(session, 5).isOnCourt, false)
})

test('outgoing-first selection still records one atomic swap at the actual incoming tap', () => {
  const session = start()
  const before = JSON.stringify(session)
  const outgoing = chooseOutgoing(createSubstitutionPlan(), 0, session.players)
  assert.equal(outgoing.action, undefined)
  const incoming = chooseIncoming(outgoing.plan, 5, session.players)
  assert.deepEqual(incoming.action, { type: 'swap', outId: 0, playerId: 5 })
  assert.equal(JSON.stringify(session), before)
  const swapped = applyAction(session, incoming.action, 4321)
  assert.equal(stateOf(swapped, 0).totalMs, 3321)
  assert.equal(stateOf(swapped, 5).totalMs, 0)
  assert.equal(courtIds(swapped).length, 5)
})

test('unmarking and undo reconciliation do not leave an invalid incoming target', () => {
  let session = start()
  let plan = createSubstitutionPlan()
  for (const id of [5, 6]) plan = chooseIncoming(plan, id, session.players).plan
  plan = chooseIncoming(plan, 5, session.players).plan
  assert.deepEqual(plan.readyIds, [6])
  assert.equal(plan.activeId, 6)
  session = applyAction(session, { type: 'swap', outId: 0, playerId: 6 }, 2000)
  plan = reconcilePlan(plan, session.players)
  assert.deepEqual(plan.readyIds, [])
  assert.equal(plan.activeId, null)
  const restoredOrder = reconcileCourtOrder([6, 1, 2, 3, 4], start().players)
  assert.deepEqual(restoredOrder, [0, 1, 2, 3, 4])
})

test('ready planning cannot create a sixth court player or add a player already on court', () => {
  const session = start()
  let plan = createSubstitutionPlan()
  for (const id of [0, 5, 6, 7, 8, 9, 10]) plan = chooseIncoming(plan, id, session.players).plan
  assert.deepEqual(plan.readyIds, [5, 6, 7, 8, 9])
  assert.equal(courtIds(session).length, 5)
  assert.equal(chooseOutgoing(plan, 11, session.players).action, undefined)
})
