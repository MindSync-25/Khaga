export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon = (name, cls='') => {
 const paths={arrow:'<path d="M4 12h15M13 5l7 7-7 7"/>',diagonal:'<path d="M6 18 18 6M6 6h12v12"/>',bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',menu:'<path d="M3 8h18M3 16h18"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',chevron:'<path d="m5 9 7 7 7-7"/>',ruler:'<path d="M3 7h18v10H3zM7 7v5M11 7v3M15 7v5M19 7v3"/>'};
 return `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
};
