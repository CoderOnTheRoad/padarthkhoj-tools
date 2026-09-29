// Both CIF renderers store only the unit-cell edges in bondLines; chemical
// bonds live separately in chemicalBondObject. Toggle edges without rebuilding
// the scene, changing selection, or affecting placement spheres and PNG exports.
export function setUnitCellVisible(viewer, visible) {
  viewer.unitCellVisible = Boolean(visible);
  viewer.bondLines.forEach(line => { line.visible = viewer.unitCellVisible; });
  const button = viewer.bondUI?.querySelector('[data-unit-cell-toggle]');
  if (button) {
    button.textContent = viewer.unitCellVisible ? 'Hide box' : 'Show box';
    button.setAttribute('aria-label', 'Show unit-cell box');
    button.setAttribute('aria-pressed', String(viewer.unitCellVisible));
    button.title = viewer.unitCellVisible ? 'Hide unit-cell boundary' : 'Show unit-cell boundary';
  }
}

export function setupUnitCellVisibility(viewer) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bond-toggle unit-cell-toggle';
  button.setAttribute('data-unit-cell-toggle', '');
  button.addEventListener('click', event => {
    event.stopPropagation();
    setUnitCellVisible(viewer, !viewer.unitCellVisible);
  });
  // Use the shared viewer toolbar, including its event isolation, theme styles
  // and disposal lifecycle. This also covers all derived CIF viewers.
  viewer.bondUI.insertBefore(button, viewer.bondUI.querySelector('.bond-popover'));
  setUnitCellVisible(viewer, true);
}
