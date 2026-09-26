// Editorial concepts, not approved manufacturing specifications or live offers.
// Prices are the proposed INR prices discussed for Collection 001, in paise.
export const colours = {
  obsidian: { name: 'Obsidian Black', hex: '#20211f', ink: '#c3aa80' },
  ivory: { name: 'Ivory White', hex: '#ece8dc', ink: '#92764f' },
  stone: { name: 'Stone Beige', hex: '#bcb09d', ink: '#5f5140' },
  terracotta: { name: 'Burnt Terracotta', hex: '#9d5845', ink: '#e0c3a1' },
  wine: { name: 'Deep Wine', hex: '#57323b', ink: '#c8ae87' },
  navy: { name: 'Midnight Navy', hex: '#263442', ink: '#c4ad88' },
  forest: { name: 'Forest Green', hex: '#34483c', ink: '#d4c7a3' },
  smoke: { name: 'Smoke Grey', hex: '#92918b', ink: '#3e4140' },
  charcoal: { name: 'Charcoal Grey', hex: '#494947', ink: '#b5a892' },
  blue: { name: 'Powder Blue', hex: '#b7ccd5', ink: '#526d78' },
  sage: { name: 'Soft Sage', hex: '#b8c3b0', ink: '#606d50' },
  rose: { name: 'Dusty Rose', hex: '#c79b99', ink: '#805758' },
  sand: { name: 'Sandstone Beige', hex: '#cebd9f', ink: '#8f7348' },
  burgundy: { name: 'Deep Burgundy', hex: '#73384c', ink: '#cfb98d' }
};
export const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
export const products = [
  { id:'origin-tee', number:'01', name:'Origin Tee', category:'tees', price:299000, colours:['obsidian','ivory','stone'], note:'The essential expression', headline:'A beginning.\nNothing more. Nothing less.', description:'The purest expression of KHAGA. A quiet centre-chest signature, an open silhouette, and room to make it your own.', details:['Small central Garuda + Sun emblem and KHAGA wordmark','Miniature emblem below the back collar','Proposed relaxed silhouette with a crew neckline'], story:'A foundation, not a uniform. Origin lets our signature speak without raising its voice.' },
  { id:'solar-tee', number:'02', name:'Solar Tee', category:'tees', price:329000, colours:['ivory','terracotta','wine'], note:'Carry the light', headline:'Light,\nin its own language.', description:'A compact solar composition surrounds the original KHAGA signature. A fine vertical accent carries the idea onto the back.', details:['Original emblem with a separate solar-ray accent','Compact centre-chest layout; not an oversized logo','Upper-back emblem with a slender vertical line'], story:'The sun is a starting point. Solar explores its radiance through a restrained arrangement of line and light.' },
  { id:'flight-tee', number:'03', name:'Flight Tee', category:'tees', price:349000, colours:['navy','forest','smoke'], note:'Motion in form', headline:'Made to\nmove beyond.', description:'An asymmetric study in movement. A small left-chest signature balances sweeping shoulder lines and a narrow upper-back arc.', details:['Approved emblem and KHAGA on the wearer’s left chest','Separate feather-inspired strokes on the opposite shoulder','Small back wordmark above a horizontal flight arc'], story:'Movement without noise. Flight takes the feeling of wings in motion and turns it into a deliberate, asymmetric detail.' },
  { id:'eclipse-tee', number:'04', name:'Eclipse Tee', category:'tees', price:399000, colours:['obsidian','ivory','charcoal'], note:'Balance in shadows', headline:'Some things\nspeak in contrast.', description:'A single curved eclipse accent meets the KHAGA signature. On the back, a quiet sequence of phases continues the story.', details:['One crescent accent on the front—not stacked moons','Small approved emblem on the wearer’s left chest','Vertical phase artwork beneath the back wordmark'], story:'Light and shadow are part of the same story. Eclipse is a study in what is revealed and what is left unsaid.' },
  { id:'ascent-tee', number:'05', name:'Ascent Tee', category:'tees', price:449000, colours:['charcoal','ivory','obsidian'], note:'A higher perspective', headline:'A little higher.\nEvery day.', description:'A fine mountain contour traces a path across the front. The signature remains small; the message on the back stays simple.', details:['Approved mountain-outline design across the lower chest','Small original Garuda + Sun signature at the left chest','“HIGHER EVERYDAY” back detail with fine vertical accents'], story:'Not a destination, but a direction. Ascent finds its expression in mountain contours and the quiet intention to keep going.' },
  { id:'form-shirt', number:'06', name:'Form Shirt', category:'shirts', price:599000, colours:['ivory','blue','sage','rose','sand','burgundy','navy'], note:'Clarity in every line', headline:'Considered form.\nEveryday presence.', description:'Our classic shirt concept: a defined collar, visible buttons, and a modest chest signature. Clean, intentional, and easy to imagine in your day.', details:['Defined pointed collar and visible button front','Small approved emblem and KHAGA on the left chest','Plain back; no external artwork'], story:'Form is the structured counterpart to our relaxed tees. Its character comes from proportion and the clarity of a classic button front.' },
  { id:'nocturne-shirt', number:'07', name:'Nocturne Shirt', category:'shirts', price:699000, colours:['obsidian'], note:'After the light', headline:'A quieter\nkind of evening.', description:'A softer open neckline, a concealed-button front, and tonal charcoal branding. An evening direction that is more than a change of colour.', details:['Proposed soft open-collar construction','Concealed-button placket and a more fluid silhouette','Charcoal-on-black emblem; plain back'], story:'Nocturne follows the light into evening. A softer construction and uninterrupted front distinguish it from Form; the final drape will be approved on a sample.' }
];
export const byId = new Map(products.map(p => [p.id, p]));
export const money = amount => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(amount / 100);
export function variant(product, colour) { return product.colours.includes(colour) ? colour : product.colours[0]; }
export function filterProducts({category='all',q='',sort='collection'}={}) {
  const query=String(q).trim().toLowerCase().slice(0,100);
  let result=products.filter(p=>(category==='all'||p.category===category)&&(!query||[p.name,p.note,...p.colours.map(c=>colours[c].name)].join(' ').toLowerCase().includes(query)));
  if(sort==='price-asc')result=result.toSorted((a,b)=>a.price-b.price);
  if(sort==='price-desc')result=result.toSorted((a,b)=>b.price-a.price);
  return result;
}
