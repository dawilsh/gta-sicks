/* GTA Sicks — shared defaults.
 * Loaded as a plain script in the content-script world and in the extension pages,
 * so everything here is a global. No modules: MV3 content scripts can't use them. */

var SOS_DEFAULT_PHRASES = [
  "Grand Theft Autumn",
  "That Game You Can Finally Buy",
  "Formerly Vapourware VI",
  "The Trailer",
  "A Review Score",
  "Some Bloke's Miami Holiday",
  "Big Car Steal 6",
  "Perpetual Marketing Machine",
  "Actual Video Game Number Six",
  "Extremely Delayed Auto",
  "Guaranteed Theft Auto (Finally)",
  "Bicycle Acquisition Simulator",
  "Rockstar's Pension Plan",
  "Screenshot Discourse Generator",
  "The Same Game With Better Puddles",
  "The Second Trailer",
  "Miami Slice",
  "Pixel Water Appreciation Simulator",
  "A Press Release",
  "Sixth Automobile Misappropriation Incident",
  "Great Car Borrow",
  "Money Printer (Interactive Edition)",
  "Wanted Level: Six",
  "Absolutely Nothing",
  "The Day One Patch",
  "Larceny Motors 6",
  "Very Large Purloining Of Vehicles",
  "Digital Sunshine State Crime Holiday",
  "Modest Theft Auto",
  "Petty Theft Bicycle",
  "Some Cars, Some Crime, Some Day (Today)",
  "Please Stop Talking About This",
  "The Discourse",
  "Beach Simulator With Guns",
  "Yet Another Trailer Breakdown",
  "Auto Theft: Extremely Grand",
  "The One With The Alligator",
  "Server Queue Simulator 2026",
  "Enormous Vehicle Borrowing VI",
  "A Number You've Heard Enough Of",
  "Considerable Motorcar Theft",
  "Sixty Articles About Nothing",
  "Rather Rude Driving Game",
  "The Cursed Numeral",
  "A Released Thing, Allegedly",
  "Loud Florida Crime Playset",
  "Download Size Anxiety Simulator",
  "Big Naughty Car Game",
  "Whatever, Honestly",
  "Two Trailers And A Prayer"
];

var SOS_DEFAULTS = {
  enabled: true,          // master switch
  mode: 'random',         // 'random' | 'custom'
  customText: '',         // used when mode === 'custom'
  variety: 'page',        // 'page' = one phrase per distinct match, 'chaos' = new phrase every time
  aggressive: false,      // also catch Leonida / Vice City / Rockstar Games / Take-Two
  collapse: true,         // fold whole posts/cards about it down to a one-line stub
  markAltered: false,     // wrap replacements in «» so you can see it wasn't their words
  attributes: true,       // patch title / alt / placeholder / aria-label
  pageTitle: true,        // patch document.title (tab title)
  phrases: [],            // empty = use SOS_DEFAULT_PHRASES
  disabledSites: []       // hostnames where the extension stays quiet
};

/* Resolve a stored settings object against the defaults. */
function sosNormalise(stored) {
  var s = Object.assign({}, SOS_DEFAULTS, stored || {});
  if (!Array.isArray(s.phrases)) s.phrases = [];
  if (!Array.isArray(s.disabledSites)) s.disabledSites = [];
  s.phrases = s.phrases.map(function (p) { return String(p).trim(); }).filter(Boolean);
  return s;
}

function sosPhrasesFor(settings) {
  return settings.phrases.length ? settings.phrases : SOS_DEFAULT_PHRASES;
}
