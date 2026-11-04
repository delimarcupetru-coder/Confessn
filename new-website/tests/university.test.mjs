import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { guideLessonByControl, interfaceCopy } from '../src/interface-copy.ts'

test('all supported languages include the complete current university manual', () => {
  assert.deepEqual(Object.keys(interfaceCopy).sort(), ['de', 'en', 'es', 'fr', 'it', 'ja', 'ro', 'ru', 'zh'])
  for (const [language, copy] of Object.entries(interfaceCopy)) {
    assert.match(copy.manualTitle, /Novanta University/, language)
    assert.equal(copy.lessons.length, 18, language)
    assert.equal(new Set(copy.lessons.map(lesson => lesson.title)).size, 18, language)
    for (const lesson of copy.lessons) {
      assert.ok(lesson.title.trim().length > 0, language)
      assert.ok(lesson.body.trim().length > 30, `${language}: ${lesson.title}`)
    }
    for (const control of ['F', 'M1', 'M2', 'S', 'B']) assert.ok(copy.lessons[5].body.includes(control), `${language}: ${control}`)
    for (const topic of ['Messages', 'Planning', 'Basket', 'Tzol Bank']) assert.ok(copy.manualIntro.includes(topic), `${language}: ${topic}`)
    assert.match(copy.lessons[3].body, /20/, language)
  }
})

test('contextual guide targets preserve existing indices and cover new workflows', () => {
  const expected = { 'Upload artwork': 0, 'Frame type': 1, 'M1 · Top mat width': 5, 'M2 · Bottom mat width': 5, 'B · Bevel cut depth': 5, 'Tzol Bank': 10, 'Publish artwork': 11, 'Edit post': 11, 'Artwork ratings': 12, 'Post comments': 12, Messages: 13, Chat: 13, Planning: 14, 'Add Event': 14, Basket: 15, 'Tzol checkout': 16, 'Place bid': 17 }
  for (const [control, index] of Object.entries(expected)) assert.equal(guideLessonByControl[control], index, control)
  for (const index of Object.values(guideLessonByControl)) assert.ok(index >= 0 && index < interfaceCopy.en.lessons.length)
})

test('current instructions distinguish real workflows from disabled trading', () => {
  const lessons = interfaceCopy.en.lessons
  assert.match(lessons[10].body, /passkey/)
  assert.match(lessons[10].body, /five minutes/)
  assert.match(lessons[11].body, /Private project notes are not copied/)
  assert.match(lessons[11].body, /Edit post/)
  assert.match(lessons[12].body, /saved score remains selected/)
  assert.match(lessons[12].body, /cannot rate your own/)
  assert.match(lessons[13].body, /text chats, not voice\/video/)
  assert.match(lessons[13].body, /Block\/unblock/)
  assert.match(lessons[14].body, /Add Event opens the editor directly/)
  assert.match(lessons[14].body, /Google Maps/)
  assert.match(lessons[15].body, /currently disabled/)
  assert.match(lessons[16].body, /passkey verification/)
  assert.match(lessons[17].body, /outbids/)
})

test('rendered manual includes the five actual adjustment labels and all lessons', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  for (const label of ['F', 'M1', 'M2', 'S', 'B']) assert.ok(app.includes(`<kbd>${label}</kbd>`), label)
  assert.ok(app.includes('ui.lessons.map((lesson, index)'))
  assert.ok(app.includes('id={`university-lesson-${index}`}'))
  assert.ok(!app.includes('aria-label="Confessn University"'))
})