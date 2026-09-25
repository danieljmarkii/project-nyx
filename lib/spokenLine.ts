// A drawn line as VoiceOver should say it (History v2, HV-10 / CUL-1167; HV-7's focus note).
//
// The screen draws a middle dot between the parts of a line ("Sun, Sep 20 · nothing
// logged", "8 logged · 1 vomit"); a voice may read "·" aloud (the HV-6 PM pass, where the
// row's own labels already turned it into a comma). So every spoken sentence built from a
// drawn line goes through here: the spaced dot becomes a comma, a pause. Only the spaced dot
// is a separator; anything else in the text is said as written.
//
// Its own module, with no imports, so a leaf component (a gap line, the count line) can
// say its words without pulling the day pipeline in behind it.
export function spokenLine(text: string): string {
  return text.replace(/\s·\s/g, ', ');
}
