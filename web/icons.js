const paths = {
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  circle:'<circle cx="12" cy="12" r="8"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  back:'<path d="m15 5-7 7 7 7"/>',
  music:'<path d="M9 18V5l11-2v13M9 7l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  car:'<path d="m5 6-2 7v6h3v-3h12v3h3v-6l-2-7H5Z"/><path d="M3 12h18M6 6l1-3h10l1 3M6 14h2m8 0h2"/>',
  walk:'<circle cx="14" cy="4" r="2"/><path d="m9 10 3-3 3 5 4 1M12 7l-2 9-3 5m3-5 5 5m-3-11-5 2"/>',
  stairs:'<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  seat:'<path d="M6 12V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7M5 12h14v5H5zM7 17v4m10-4v4"/>',
  cup:'<path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 1h3a3 3 0 0 1 0 6h-3M8 2v3m5-3v3"/>',
  food:'<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18m12 0V3c-4 2-5 8 0 10"/>',
  camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18"/>',
  location:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  swap:'<path d="M3 8h17l-4-4M21 16H4l4 4"/>',
  file:'<path d="M5 2h9l5 5v15H5zM14 2v6h5M9 12h6m-6 4h6"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8 10 7-4M8 14l7 4"/>',
  download:'<path d="M12 2v14m-5-5 5 5 5-5M4 18v4h16v-4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7m0-11v1"/>',
  sparkles:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>'
};
export function icon(name, cls='') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}
