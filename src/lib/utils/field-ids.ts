// The id of a form field's label, from the id FormControl gives the field's control (src/components/ui/form.tsx).
// A control that is no labelable element, such as the inline calendar below md, cannot be named by
// `<label for>`, so it points aria-labelledby at this id (src/components/forms/date-picker.tsx).
export function fieldLabelId(controlId: string): string {
  return `${controlId}-label`;
}
