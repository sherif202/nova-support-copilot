<!-- prompt: retry note · version 1.0.0 · used at build step 12 -->
<!-- Sent once, as an extra user turn, when an output check fails. If the second try fails too, code shows the "check failed" reply and hands off. Never a third try. -->

Your last reply failed a check before the customer saw it: {{FAILED_CHECK}}.
{{FIX_HINT}}
Write the reply again, following every rule in your instructions. Return the same JSON shape and nothing else.

<!-- FIX_HINT by check, filled in by code:
broken_json      -> Return only the JSON object, with no text before or after it.
unknown_source   -> Cite only IDs that appear in <policies> or <customer_records>: {{UNKNOWN_IDS}} do not.
ungrounded_number-> These amounts are not in any source: {{NUMBERS}}. Use only amounts from the sources, or say you don't have that information.
promise_word     -> Don't say approved, refunded, waived or will be returned. Say what stage it is at and who decides.
wrong_language   -> The customer wrote in {{INPUT_LANGUAGE}}. Reply in that language; Franco-Arabic gets Arabic script.
card_digits      -> Show at most the last 4 digits of any card.
-->
