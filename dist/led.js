// Compress the visual range smoothly so overcurrent does not flatten the
// display at the rated current. The electrical reading stays in amperes.
export function ledLevel(current){
  return current>0&&Number.isFinite(current)?current/(current+.075):0;
}
