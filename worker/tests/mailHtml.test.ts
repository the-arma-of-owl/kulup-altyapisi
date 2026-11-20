import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanEmailHtml } from '../server/mailHtml.js'

test('etkin içerik ve olay öznitelikleri kaldırılır', () => {
  const html = '<SCRIPT>alert(1)</SCRIPT><iframe src="https://example.invalid">içerik</iframe>' +
    '<object>nesne</object><embed src="x"><form action="/gonder">form</form><base href="/">' +
    '<META HTTP-EQUIV=refresh content="0;url=/"><p OnClick=go() onload="go()">Metin</p>'
  const clean = cleanEmailHtml(html)
  assert.doesNotMatch(clean, /script|iframe|object|embed|form|base|refresh|onclick|onload|alert\(1\)|nesne|içerik/i)
  assert.match(clean, /<p>Metin<\/p>/)
})

test('tehlikeli URL şemaları tırnaklı, tırnaksız ve kodlanmış biçimde kaldırılır', () => {
  const clean = cleanEmailHtml('<a HREF=JaVaScRiPt:go()>a</a><img src="vbscript:go()">' +
    '<a href="java&#x73;cript:go()">b</a><img src=data:text/html,evil><form action=javascript:go()>x</form>')
  assert.doesNotMatch(clean, /javascript:|vbscript:|data:text|href=|src=|action=/i)
  assert.match(clean, /<a>a<\/a>/)
  assert.match(clean, /<a>b<\/a>/)
})

test('Canva düzeni, güvenli görsel ve değişkenler korunur', () => {
  const html = '<style>table { width: 100% }</style><table style="width:100%"><tr><td>{{ad}}</td></tr></table>' +
    '<img src="data:image/png;base64,AAAA"><img src=data:image/jpeg;base64,AAAA>'
  assert.equal(cleanEmailHtml(html), html)
})
