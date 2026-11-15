// Everyday "where can I…" answers that point at places on the map.
// Each topic: words that trigger it (stems are fine), the answer, and the place ids to show.
// Keep answers to things that are true for UTA year-round; hours and rules change, so link out for those.
// When we aren't sure of an office's exact page, link a uta.edu search instead of guessing a URL.

/** A Google search limited to uta.edu: always works, and finds UTA's current page for anything. */
export function utaSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:uta.edu ${query}`)}`;
}

const search = (query) => ({ link: utaSearchUrl(query), linkLabel: `Search uta.edu: ${query}` });

// Topics about UTA life and services beyond places on the map.
const UTA_LIFE = [
  {
    id: "clubs",
    words: ["club", "clubs", "organization", "organizations", "student org", "student orgs", "rso", "join a club", "get involved", "involvement", "society", "chapter"],
    text:
      "UTA has hundreds of student organizations: academic and major clubs, cultural, faith, service, gaming, sports clubs and more. Browse them and join on MavEngage with your NetID. Lots of clubs also post meetings and socials, which show up in the Events tab.",
    places: ["uc"],
    link: "https://mavengage.uta.edu",
    linkLabel: "Open MavEngage",
    events: ["club", "student organization", "student org", "general meeting", "society", "association"],
    priority: true, // "clubs for computer science" is about clubs, not the CS department
  },
  {
    id: "greek",
    words: ["fraternity", "fraternities", "sorority", "sororities", "greek life", "greek", "rush", "recruitment"],
    text: "Fraternities and sororities at UTA are part of Fraternity & Sorority Life. Chapters recruit mostly at the start of each semester; find them on MavEngage.",
    link: "https://mavengage.uta.edu",
    linkLabel: "Open MavEngage",
    events: ["fraternity", "sorority", "greek", "recruitment"],
  },
  {
    id: "intramurals",
    words: ["intramural", "intramurals", "club sport", "club sports", "rec league", "league", "imleagues", "team sport", "flag football", "soccer"],
    text: "Intramural leagues and club sports are run by Campus Recreation out of the Maverick Activities Center (MAC). Sign-ups open each semester.",
    places: ["mac"],
    ...search("campus recreation intramurals"),
  },
  {
    id: "fun",
    words: ["fun", "things to do", "bored", "hang out", "free food", "social", "party", "movie night", "game night", "weekend", "nightlife"],
    text: "Here's what's coming up on campus. EXCEL Campus Activities and student orgs host free events all the time, so check the Events tab too.",
    places: ["uc"],
    events: ["free", "social", "night", "party", "celebration", "festival", "movie", "game"],
    showUpcoming: true,
  },
  {
    id: "career",
    words: ["career", "careers", "resume", "résumé", "internship", "internships", "job fair", "career fair", "interview", "handshake", "cover letter", "linkedin"],
    text: "The Lockheed Martin Career Development Center helps with résumés, mock interviews, internships and career fairs. Jobs and internships, including on-campus jobs, are posted on Handshake.",
    events: ["career", "resume", "internship", "job", "employer", "networking"],
    ...search("career development center"),
  },
  {
    id: "jobs",
    words: ["campus job", "on campus job", "student job", "work study", "student employment", "part time job", "student worker"],
    text: "On-campus jobs (including work-study) are posted on Handshake. Log in with your NetID and filter for on-campus positions.",
    ...search("student employment handshake"),
  },
  {
    id: "majors",
    words: ["major", "majors", "degree", "degrees", "programs", "colleges", "change my major", "minor"],
    text:
      "UTA's colleges include Engineering, Science, Business, Liberal Arts, Nursing and Health Innovation, Architecture, Planning and Public Affairs (CAPPA), Education and Social Work. Talk to your academic advisor about changing majors or adding a minor.",
    places: ["nh", "sh", "coba", "uh", "ph", "cappa", "swsh"],
    ...search("degree programs"),
  },
  {
    id: "tuition",
    words: ["tuition", "pay my bill", "bill", "payment plan", "bursar", "student accounts", "refund", "fees", "pay tuition"],
    text: "See your bill and pay tuition in MyMav (Student Center → Account). Payment plans and refunds are handled by Student Accounts.",
    link: "https://mymav.uta.edu",
    linkLabel: "Open MyMav",
  },
  {
    id: "scholarships",
    words: ["scholarship", "scholarships", "grant", "grants", "free money"],
    text: "UTA scholarships are open to current and incoming students; most use one application each year. Financial Aid can also help with grants.",
    ...search("scholarships apply"),
  },
  {
    id: "transcript",
    words: ["transcript", "transcripts", "enrollment verification", "degree audit", "gpa"],
    text: "Unofficial transcripts and your degree audit are in MyMav. Official transcripts are ordered through the Office of the Registrar.",
    link: "https://mymav.uta.edu",
    linkLabel: "Open MyMav",
  },
  {
    id: "graduation",
    words: ["graduate", "graduation", "apply to graduate", "commencement", "cap and gown", "diploma"],
    text: "Apply to graduate in MyMav before your semester's deadline. Commencement ceremonies are held at College Park Center, and caps and gowns come from the UTA Bookstore.",
    places: ["cpc", "bookstore"],
    ...search("apply to graduate"),
  },
  {
    id: "international",
    words: ["international student", "international students", "visa", "i-20", "i20", "opt", "cpt", "f-1", "f1", "sevis"],
    text: "International students get help with visas, I-20s, travel signatures and OPT/CPT from UTA's international students and scholars office.",
    ...search("international students and scholars"),
  },
  {
    id: "disability",
    words: ["disability", "accommodation", "accommodations", "accessibility", "ada", "testing accommodations", "adhd"],
    text: "Academic accommodations (extra testing time, note-taking help, accessible housing) are set up through UTA's Student Access and Resource Center.",
    ...search("student access and resource center"),
  },
  {
    id: "study-abroad",
    words: ["study abroad", "exchange", "abroad", "travel program"],
    text: "Study abroad and exchange programs are run by UTA's study abroad office. Many trips count toward your degree and have scholarships.",
    ...search("study abroad"),
  },
  {
    id: "research",
    words: ["research", "undergraduate research", "lab position", "research assistant"],
    text: "To get into research, talk to professors whose work interests you; most labs take undergrads. UTA's Office of Undergraduate Research has programs and funding.",
    places: ["seir", "erb", "ls"],
    ...search("undergraduate research"),
  },
  {
    id: "volunteer",
    words: ["volunteer", "volunteering", "community service", "service hours"],
    text: "Find volunteer and service events through UTA Volunteers and service organizations on MavEngage.",
    link: "https://mavengage.uta.edu",
    linkLabel: "Open MavEngage",
    events: ["volunteer", "service"],
  },
  {
    id: "student-gov",
    words: ["student government", "senate", "student senator", "student body president", "sga"],
    text: "Student Government represents UTA students and funds student orgs. Elections are held each spring; find it on MavEngage.",
    link: "https://mavengage.uta.edu",
    linkLabel: "Open MavEngage",
  },
  {
    id: "food-pantry",
    words: ["food pantry", "free groceries", "food insecurity", "cant afford food", "can't afford food", "emergency aid", "emergency fund"],
    text: "If money for food or bills is tight, UTA has a campus food pantry and emergency aid for students. Search below for current hours and how to apply.",
    ...search("food pantry emergency aid"),
  },
  {
    id: "writing",
    words: ["writing center", "essay help", "paper help", "proofread", "writing tutor"],
    text: "The University Writing Center helps with papers at any stage, from brainstorming to citations. Book an appointment online.",
    places: ["cl"],
    ...search("writing center appointment"),
  },
  {
    id: "planetarium",
    words: ["planetarium", "stars", "astronomy", "space show"],
    text: "The UTA Planetarium is in the Chemistry & Physics Building and runs shows for students and the public.",
    places: ["cpb"],
    ...search("planetarium shows"),
  },
  {
    id: "gallery",
    words: ["gallery", "art gallery", "museum", "exhibit", "exhibition"],
    text: "The Gallery at UTA in the Fine Arts Building has rotating art exhibits that are free to visit.",
    places: ["fa"],
    ...search("the gallery at UTA"),
  },
  {
    id: "esports",
    words: ["esports", "e-sports", "video games", "gaming", "gamer"],
    text: "UTA has an esports program and gaming clubs. Find gaming organizations and tournaments on MavEngage.",
    link: "https://mavengage.uta.edu",
    linkLabel: "Open MavEngage",
    events: ["esports", "gaming", "game", "tournament"],
  },
];

// How to use MavMap itself.
export const APP_TOPICS = [
  {
    id: "app-overview",
    words: ["what can this app do", "what is mavmap", "what does this app do", "how does this app work", "how do i use this app", "how to use this app", "how to use mavmap", "app features", "tutorial"],
    text:
      "MavMap is UTA's campus map:\n• Tap any building (or search at the top) to see it, save it with ☆ and Get directions.\n• The Directory pill opens the menu: Directory (every place, filter by type), Classes (your schedule), Events and Transit (shuttle).\n• Preferences (top right) has themes, text size, map view and map layers.\n• Ask me anything about campus, rooms like “NH 106”, or “how do I…” about the app.",
  },
  {
    id: "app-directions",
    words: ["get directions", "directions", "navigate", "navigation", "turn by turn", "walking directions", "driving directions", "take me to", "route to", "how do i get to"],
    text:
      "To get directions: tap a building on the map (or find it in the Directory or search bar), then tap ➤ Get directions. Allow location when your browser asks. Pick 🚶 Walk or 🚗 Drive at the bottom; MavMap follows you and re-routes if you go off course. Tap End when you're done.",
    app: true,
  },
  {
    id: "app-save",
    words: ["save a building", "save an event", "favorite", "favorites", "favourite", "star a building", "saved places", "bookmark"],
    text: "Tap ☆ next to any building or event to save it (it turns into ★). Find saved places under ★ Saved in the Directory and saved events under ★ Saved in Events. Saving events also teaches MavMap what to suggest.",
    app: true,
  },
  {
    id: "app-schedule",
    words: ["add my schedule", "add my classes", "upload my schedule", "upload schedule", "schedule pdf", "class schedule", "import schedule", "add a class", "classes tab"],
    text:
      "Open the menu (Directory pill) → Classes. Then either:\n• ⬆ Upload schedule PDF: in MyMav go to Student Center → My Class Schedule and save it as a PDF,\n• paste your schedule text, or\n• + Add a class by hand.\nMavMap shows each class's building and floor, and the Next class card tells you how long it takes to get there and when to leave.",
    app: true,
  },
  {
    id: "app-theme",
    words: ["dark mode", "light mode", "theme", "odyssey", "change colors", "text size", "bigger text", "font size", "larger text"],
    text: "Open Preferences (top right). Under Appearance you can pick Dark, Light, Match device or ⚡ The Odyssey theme, and make the text Large or Extra large.",
    app: true,
  },
  {
    id: "app-mapview",
    words: ["satellite", "satellite view", "street view", "map view", "openstreetmap", "osm", "change the map"],
    text: "Open Preferences (top right) → Map → Map view, and pick Street, Satellite or OpenStreetMap.",
    app: true,
  },
  {
    id: "app-layers",
    words: ["outlines", "highlights", "building names", "labels", "hide names", "heatmap", "traffic", "colors on the map", "what do the colors mean"],
    text:
      "Building outlines are colored by type: yellow academic, light blue student life, orange athletics, purple admin, green housing, amber dining, blue parking (with a P). Turn the outlines, building names and the event heatmap on or off in Preferences → Map.",
    app: true,
  },
  {
    id: "app-bus",
    words: ["bus", "bus route", "bus routes", "shuttle", "mavmover", "bus stop", "bus stops", "transit"],
    text: "Open the menu → Transit to see the MavMover routes and stops. Tap Show on a route (or Show all routes) to draw it on the map, or turn routes on in Preferences → Map.",
    app: true,
  },
  {
    id: "app-events",
    words: ["calendar", "add to calendar", "add to my calendar", "google calendar", "apple calendar", "events tab", "find events", "event filter"],
    text: "Open the menu → Events. Filter by type with the chips (swipe or use the arrows), tap ☆ to save one, and use + Google Calendar or Apple Calendar to add it to your calendar.",
    app: true,
  },
  {
    id: "app-search",
    words: ["search bar", "search for", "find a building", "find a room", "look up a room", "room number"],
    text: "Type a building name or code (like ERB or Nedderman) in the search bar at the top, or ask me a room like “NH 106” and I'll tell you the building and floor.",
    app: true,
  },
  {
    id: "app-phone",
    words: ["home screen", "add to home screen", "install", "on my phone", "iphone", "android", "app icon"],
    text: "On iPhone, open MavMap in Safari, tap Share, then Add to Home Screen. On Android (Chrome), tap ⋮ then Add to Home screen. On phones you can swipe panels down to close them.",
    app: true,
  },
  {
    id: "app-suggestions",
    words: ["suggestions", "suggested events", "popup", "pop up", "stop suggestions", "recommendations"],
    text: "MavMap suggests events when it starts, based on events you save, add to your calendar or open. Turn it off or clear what it learned in Preferences → Suggestions.",
    app: true,
  },
  {
    id: "app-privacy",
    words: ["privacy", "my data", "location data", "is my data", "tracking", "stored"],
    text: "Your saved places, schedule and preferences stay in this browser only. Your location is only used while you get directions or check travel time, and is sent to Google just to compute the route.",
    app: true,
  },
];

export const TOPICS = [
  ...UTA_LIFE,
  {
    id: "basketball",
    words: ["basketball", "hoop", "hoops", "pickup game", "shoot around", "ball court"],
    text:
      "To play pickup basketball, head to the Maverick Activities Center (MAC). It has indoor courts open to students, and you get in with your Mav ID. To watch the UTA Mavericks play, games are at College Park Center.",
    places: ["mac", "cpc"],
  },
  {
    id: "volleyball",
    words: ["volleyball", "badminton", "pickleball", "racquetball", "indoor soccer", "futsal"],
    text:
      "Court sports are at the Maverick Activities Center (MAC), the campus rec center; bring your Mav ID. UTA's volleyball team plays its home games at College Park Center.",
    places: ["mac", "cpc"],
  },
  {
    id: "workout",
    words: ["workout", "work out", "lift", "lifting", "weights", "exercise", "fitness", "treadmill", "rec center", "recreation", "cardio", "gym"],
    text: "The Maverick Activities Center (MAC) is the campus rec center: weights, cardio machines, courts, an indoor track and fitness classes. Students get in with their Mav ID.",
    places: ["mac"],
  },
  {
    id: "sports-games",
    words: ["game", "games", "watch", "athletics", "mavs game", "tickets", "sporting event", "track meet", "track and field"],
    text:
      "UTA basketball and volleyball games are at College Park Center. Track and field meets are at Maverick Stadium. Schedules and tickets are on utamavs.com, and students usually get in free with their Mav ID.",
    places: ["cpc", "stadium"],
    link: "https://utamavs.com",
  },
  {
    id: "concerts",
    words: ["concert", "commencement", "graduation", "graduate ceremony", "big event", "arena"],
    text: "Commencement, concerts and other big events are usually held at College Park Center. Check the Events tab for what's coming up.",
    places: ["cpc"],
  },
  {
    id: "coffee",
    words: ["coffee", "latte", "espresso", "starbucks", "caffeine"],
    text: "There are Starbucks in the University Center, on Spaniolo Dr and on Nedderman Dr, plus Panera next to campus.",
    places: ["starbucks-uc", "starbucks-spaniolo", "starbucks-nedderman", "panera-spaniolo"],
  },
  {
    id: "boba",
    words: ["boba", "bubble tea", "milk tea", "tea"],
    text: "Tea Co in the University Center has bubble tea.",
    places: ["tea-co-uc"],
  },
  {
    id: "dining-hall",
    words: ["dining hall", "meal plan", "swipe", "all you can eat", "buffet", "cafeteria"],
    text: "The dining halls are Connection Cafe in the University Center and The Commons. Meal-plan hours change by semester, so check UTA Dining before you go.",
    places: ["connection-cafe", "commons"],
  },
  {
    id: "vegetarian",
    words: ["vegetarian", "vegan", "indian", "plant based", "meatless"],
    text: "Kalachandji's in the University Center serves Indian vegetarian food. The dining halls also have vegetarian options.",
    places: ["kalachandjis-uc", "connection-cafe"],
  },
  {
    id: "food",
    words: ["food", "eat", "hungry", "lunch", "dinner", "breakfast", "snack", "restaurant", "food court"],
    text: "The University Center (UC) food court has Chick-fil-A, Panda Express, Rusty Taco, Subway and more. The dining halls are Connection Cafe and The Commons.",
    places: ["uc", "connection-cafe", "commons"],
  },
  {
    id: "housing",
    words: ["dorm", "dorms", "residence hall", "live on campus", "housing", "apartment", "apartments", "where to live", "on campus living"],
    text: "Residence halls include Arlington Hall, Kalpana Chawla Hall, Maverick Hall, Vandergriff Hall and West Hall. UTA also has apartments like Timber Brook, Meadow Run, Centennial Court and Maverick Place. Open the Directory and pick Housing to see them all.",
    places: ["arhl", "kch", "mavh", "vg", "westh"],
    category: "housing",
  },
  {
    id: "parking-lots",
    words: ["park", "parking lot", "parking lots", "garage", "garages", "where to park", "park my car", "parking spot", "parking near"],
    text: "The main garages are Maverick Parking Garage, Park North, Park Central, Park South and the West Campus garage, and there are surface lots all over campus (the blue P signs on the map). Most need a UTA permit; visitors can pay in the garages. Open the Directory and pick Parking to see every lot.",
    places: ["maverick-garage", "park-north", "park-central", "park-south", "west-garage"],
    link: "https://www.uta.edu/parking",
    category: "parking",
  },
  {
    id: "permit",
    words: ["parking permit", "permit", "parking ticket", "citation", "parking office"],
    text: "Parking permits and citations are handled by Parking and Transportation Services. You can buy and manage a permit online at uta.edu/parking.",
    places: ["pats"],
    link: "https://www.uta.edu/parking",
  },
  {
    id: "bike",
    words: ["bike", "bicycle", "bike repair", "flat tire", "scooter"],
    text: "The UTA Bike Barn does bike repairs and rentals.",
    places: ["bike-barn"],
  },
  {
    id: "veterans",
    words: ["veteran", "veterans", "military", "gi bill", "va benefits"],
    text: "Military and Veteran Services helps student veterans and military families with benefits and support.",
    places: ["mvs"],
  },
  {
    id: "childcare",
    words: ["child care", "childcare", "daycare", "day care", "preschool", "kids"],
    text: "The Transforming Lives Child Development Center offers child care on campus.",
    places: ["tlcdc"],
  },
  {
    id: "doctor",
    words: ["doctor", "sick", "clinic", "nurse", "pharmacy", "flu shot", "vaccine", "medical"],
    text: "Student Health Services runs a clinic for students with appointments, a pharmacy and immunizations. For an emergency, call 911.",
    places: ["health-center"],
  },
  {
    id: "textbooks",
    words: ["textbook", "textbooks", "books", "school supplies", "uta gear", "merch", "hoodie", "shirt"],
    text: "The UTA Bookstore has textbooks, supplies and UTA gear.",
    places: ["bookstore"],
  },
  {
    id: "art",
    words: ["art studio", "studio art", "art class", "painting", "sculpture", "ceramics", "art building"],
    text: "Studio art classes meet at the Studio Arts Center and the Fine Arts Building.",
    places: ["sac", "fa"],
  },
  {
    id: "music-theatre",
    words: ["music", "theatre", "theater", "recital", "band", "choir"],
    text: "Music and theatre are in the Fine Arts Building. Texas Hall hosts big performances and lectures.",
    places: ["fa", "tex"],
  },
  {
    id: "engineering",
    words: ["engineering", "engineer"],
    text: "The College of Engineering is centered on Nedderman Hall, with the Engineering Research Building (ERB), the Engineering Lab Building (ELAB), Woolf Hall and the SEIR building nearby.",
    places: ["nh", "erb", "elab", "wh", "seir"],
  },
  {
    id: "business",
    words: ["business school", "business college", "college of business", "accounting", "finance class", "marketing"],
    text: "The College of Business is in the Business Building (COBA).",
    places: ["coba"],
  },
  {
    id: "architecture",
    words: ["architecture", "urban planning", "public affairs", "interior design", "landscape"],
    text: "Architecture, Planning and Public Affairs (CAPPA) has its own building on the north side of campus.",
    places: ["cappa"],
  },
  {
    id: "nursing",
    words: ["nursing", "nurse program", "kinesiology"],
    text: "The College of Nursing and Health Innovation is based in Pickard Hall. Kinesiology classes and labs are in the Physical Education Building.",
    places: ["ph", "peb"],
  },
  {
    id: "social-work",
    words: ["social work", "smart hospital"],
    text: "The School of Social Work and the Smart Hospital share a building on the east side of campus.",
    places: ["swsh"],
  },
  {
    id: "science",
    words: ["chemistry", "physics", "biology", "geology", "earth science", "math", "mathematics"],
    text: "Science classes are spread around central campus: Chemistry & Physics Building, Life Sciences, Science Hall, Earth & Environmental Sciences and Pickard Hall (math).",
    places: ["cpb", "ls", "sh", "ees", "ph"],
  },
  {
    id: "restroom",
    words: ["restroom", "bathroom", "toilet", "washroom"],
    text: "Every campus building has restrooms. The University Center and Central Library are open the longest hours.",
    places: ["uc", "cl"],
  },
  {
    id: "safety",
    words: ["police", "emergency", "unsafe", "escort", "lost and found", "stolen"],
    text: "University Police: call 911 in an emergency, or 817-272-3003 for anything else.",
    places: ["uta-police"],
  },
];
