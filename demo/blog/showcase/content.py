"""
The showcase's content: a made-up travel and design magazine,
"Northbound". Every name, person and story here is fictional.
"""

SITE = {
    "site_name": "Northbound",
    "tagline": "Slow travel, good design and the places in between.",
    "brand_color": "#4f46e5",
    "accent_color": "#f97316",
    "contact_email": "hello@northbound.example",
}

# username: (first name, last name, email, superuser)
PEOPLE = {
    "admin": ("Alex", "Morgan", "alex@northbound.example", True),
    "maya": ("Maya", "Lindqvist", "maya@northbound.example", False),
    "jonas": ("Jonas", "Weber", "jonas@northbound.example", False),
    "priya": ("Priya", "Raman", "priya@northbound.example", False),
    "sam": ("Sam", "Okafor", "sam@northbound.example", False),
}

# (name, color, description)
CATEGORIES = [
    ("Travel", "#0ea5e9", "Itineraries, routes and the joy of arriving slowly."),
    ("Design", "#8b5cf6", "Objects, interiors and the people who make them."),
    ("Outdoors", "#16a34a", "Trails, summits and nights under the stars."),
    ("Culture", "#f59e0b", "Cities, festivals and the stories they tell."),
    ("Food", "#ef4444", "Markets, kitchens and long tables."),
    ("Field notes", "#64748b", "Short dispatches from the road."),
]

# folder (None for the library's root): [(scene, name, alt text, tags,
# focal point or None)]
MEDIA = {
    None: [
        (
            "alpine-dawn",
            "Alpine dawn",
            "Layered mountain ridges under a pink dawn sky",
            ["mountains", "sunrise"],
            {"x": 68, "y": 38},
        ),
        (
            "golden-coast",
            "Golden coast",
            "The sun setting over a calm sea with a long reflection",
            ["sea", "sunset"],
            {"x": 50, "y": 50},
        ),
        (
            "misty-forest",
            "Misty forest",
            "Pine forest layers disappearing into fog",
            ["forest", "fog"],
            None,
        ),
        (
            "desert-dunes",
            "Desert dunes",
            "Rolling sand dunes in warm evening light",
            ["desert", "sunset"],
            {"x": 30, "y": 36},
        ),
        (
            "night-peaks",
            "Night peaks",
            "A full moon over dark peaks and a starry sky",
            ["mountains", "night", "stars"],
            {"x": 78, "y": 22},
        ),
        (
            "city-dusk",
            "City at dusk",
            "A city skyline with lit windows at dusk",
            ["city", "night"],
            None,
        ),
        (
            "blue-ridge",
            "Blue ridge",
            "Hazy blue mountain ridges fading into the distance",
            ["mountains", "haze"],
            {"x": 25, "y": 30},
        ),
        (
            "pale-sea",
            "Pale sea",
            "A pale morning sun above a quiet bay",
            ["sea", "morning"],
            {"x": 50, "y": 50},
        ),
    ],
    "Artwork": [
        (
            "aurora",
            "Aurora gradient",
            "Soft green and violet gradient artwork",
            ["abstract", "gradient"],
            None,
        ),
        (
            "sorbet",
            "Sorbet gradient",
            "Pastel pink, peach and lilac gradient artwork",
            ["abstract", "gradient"],
            None,
        ),
        (
            "ember",
            "Ember gradient",
            "Deep red and orange gradient artwork",
            ["abstract", "gradient"],
            None,
        ),
        (
            "bauhaus-warm",
            "Bauhaus, warm",
            "Geometric composition of circles and squares in warm colors",
            ["abstract", "geometric"],
            None,
        ),
        (
            "bauhaus-cool",
            "Bauhaus, cool",
            "Geometric composition of circles and squares in cool colors",
            ["abstract", "geometric"],
            None,
        ),
    ],
    "Studio shots": [
        (
            "terracotta-sphere",
            "Terracotta sphere",
            "A terracotta sphere on a cream backdrop",
            ["object", "studio"],
            {"x": 50, "y": 50},
        ),
        (
            "lilac-sphere",
            "Lilac sphere",
            "A lilac sphere on a pale lilac backdrop",
            ["object", "studio"],
            {"x": 50, "y": 50},
        ),
    ],
    # Folders for the team, still empty.
    "Brand": [],
    "Contributors": [],
}

# The articles, oldest first. days: days since publication (None for a
# draft); views; author username; featured; categories; cover scene.
ARTICLES = [
    {
        "title": "Ten days on the coastal path",
        "cover": "pale-sea",
        "categories": ["Travel", "Outdoors"],
        "author": "jonas",
        "days": 94,
        "views": 4120,
        "body": [
            "The coastal path does not hurry you. It climbs, drops to a cove, climbs again, and somewhere around the third day you stop checking the map and start reading the tide tables instead.",
            "We walked it end to end with one pack each and no bookings. Every evening ended at a harbour with a single pub, a bench facing west and a bed that cost less than a train ticket.",
            "What we learned: pack less than you think, start before the day-trippers, and always take the inland detour when a local recommends it.",
        ],
    },
    {
        "title": "Inside a studio that makes nothing new",
        "cover": "terracotta-sphere",
        "categories": ["Design"],
        "author": "priya",
        "days": 81,
        "views": 2310,
        "body": [
            "The studio's shelves are full of broken chairs, chipped bowls and lamps with frayed cords. Nothing leaves the workshop until it has been repaired, not replaced.",
            "Its founder calls it maintenance as a design practice: every repair is a decision about what to keep, and every visible seam is a record of it.",
            "We spent a week at the bench and left with a mended jug and a new respect for glue.",
        ],
    },
    {
        "title": "A guide to the night sky for city people",
        "cover": "night-peaks",
        "categories": ["Outdoors", "Field notes"],
        "author": "sam",
        "days": 66,
        "views": 5875,
        "body": [
            "Most of us have never seen the Milky Way. Not because it is rare, but because we live under a dome of light that hides it.",
            "Drive an hour beyond the last streetlight, give your eyes twenty minutes, and the sky fills in. Start with the bright planets, then the summer triangle, then simply lie back.",
            "Bring a red torch, a thermos and someone patient. The stars are not going anywhere.",
        ],
    },
    {
        "title": "The quiet geometry of the Bauhaus",
        "cover": "bauhaus-warm",
        "categories": ["Design", "Culture"],
        "author": "priya",
        "days": 52,
        "views": 3460,
        "body": [
            "A circle, a square and a triangle. The school's teachers believed these three shapes, in primary colors, could carry everything a design needed to say.",
            "A century later their grids still sit under our posters, apps and kitchen cabinets. We traced the ideas from the workshop to the screen in front of you.",
            "Our favourite discovery: the original timetable, laid out on the same grid as the furniture.",
        ],
    },
    {
        "title": "Eating our way along the old market streets",
        "cover": "ember",
        "categories": ["Food", "Culture"],
        "author": "maya",
        "days": 45,
        "views": 2980,
        "body": [
            "The market opens at five, when the bakers hand bread over the counters still too hot to hold. By seven the spice sellers have arrived, and by nine you cannot hear yourself think.",
            "We followed three cooks through a morning of shopping and an afternoon of cooking, and ate at a long table that seated whoever walked in.",
            "Recipes for the flatbread, the slow tomatoes and the cardamom buns are at the end.",
        ],
    },
    {
        "title": "Sand, silence and a borrowed tent",
        "cover": "desert-dunes",
        "categories": ["Travel", "Outdoors"],
        "author": "jonas",
        "days": 38,
        "views": 6240,
        "body": [
            "The desert is loud in a way you do not expect: wind across the ridges, sand ticking against the tent, your own heartbeat when everything else stops.",
            "Our guide walked ahead without a map, reading the dunes like a street plan. By the second night we had stopped asking how.",
            "Go in the shoulder season, carry more water than you think, and leave the drone at home.",
        ],
    },
    {
        "title": "How we redesigned Northbound",
        "cover": "sorbet",
        "categories": ["Design", "Field notes"],
        "author": "admin",
        "days": 30,
        "views": 1985,
        "body": [
            "Our old site was built for a magazine that published twice a month. We now publish twice a day, with a team spread over four time zones.",
            "The new design starts from the reading experience: generous type, images that load at the right size, and a layout that gets out of the way.",
            "Behind the scenes, our editors moved to a new studio for writing, scheduling and managing every photo we own.",
        ],
    },
    {
        "title": "The last ferry of the season",
        "cover": "golden-coast",
        "categories": ["Travel", "Field notes"],
        "author": "sam",
        "days": 24,
        "views": 3710,
        "body": [
            "On the last ferry of the season the crew know every passenger by name. The café runs out of everything but tea, and nobody minds.",
            "We crossed at sunset with islanders heading home for the winter and a dog that had made the trip more often than any of us.",
        ],
    },
    {
        "title": "Five forest walks within an hour of the city",
        "cover": "misty-forest",
        "categories": ["Outdoors"],
        "author": "maya",
        "days": 17,
        "views": 7480,
        "body": [
            "You do not need a long weekend to get lost among trees. These five walks start at a train station and end at a café, with a few hours of pine needles in between.",
            "Each one is under fifteen kilometres, waymarked and quiet on weekdays. Our favourite is the third: a ridge walk above the fog line that feels much further from home than it is.",
        ],
    },
    {
        "title": "After dark: a night walk through the old town",
        "cover": "city-dusk",
        "categories": ["Culture", "Travel"],
        "author": "jonas",
        "days": 11,
        "views": 4390,
        "body": [
            "Cities change shift at dusk. The office towers empty, the bakeries close, and a different city takes over: night buses, late kitchens and lit windows.",
            "We walked from sunset to sunrise with a night-shift nurse, a jazz pianist and a baker starting the next day's bread.",
        ],
    },
    {
        "title": "Colour notes: the palette of a northern autumn",
        "cover": "alpine-dawn",
        "categories": ["Design", "Outdoors"],
        "author": "priya",
        "days": 6,
        "views": 2150,
        "body": [
            "Autumn this far north is short and loud: heather pink, birch gold, and a violet sky that lasts for hours.",
            "We asked six designers to build a palette from a single morning walk, and turned the results into swatches you can download.",
        ],
    },
    {
        "title": "Why the best trips start with a slow train",
        "cover": "blue-ridge",
        "categories": ["Travel"],
        "author": "maya",
        "days": 2,
        "views": 1240,
        "featured": True,
        "body": [
            "The window seat on a slow train is the best view in travel: mountains arriving one ridge at a time, villages close enough to read the shop signs.",
            "Our editor rode three regional lines in a week, changed trains eleven times and never once wished for a plane.",
            "Here is the route, the tickets that save you money and the stations worth getting off at.",
        ],
    },
    {
        "title": "A weekend guide to the northern lights",
        "cover": "aurora",
        "categories": ["Travel", "Outdoors"],
        "author": "sam",
        "days": None,
        "views": 0,
        "body": [
            "Draft. Forecasts, the best viewing spots and what to wear when it is minus twenty at midnight.",
        ],
    },
    {
        "title": "Objects of the year: our editors' picks",
        "cover": "lilac-sphere",
        "categories": ["Design"],
        "author": "priya",
        "days": None,
        "views": 0,
        "body": [
            "Draft. Twelve objects that made our desks, kitchens and bags better this year, and the small studios behind them.",
        ],
    },
    {
        "title": "The new rules of modern design",
        "cover": "bauhaus-cool",
        "categories": ["Design", "Culture"],
        "author": "admin",
        "days": None,
        "views": 0,
        "body": [
            "Draft. Fewer features, better defaults, and why every interface should feel calm.",
        ],
    },
]

# Short dispatches, published more often lately: they fill the recent
# weeks of the publishing sparkline.
FIELD_NOTES = [
    ("Field notes: first snow on the pass", "night-peaks", "sam", 1, 860),
    ("Field notes: the bakery that opens at four", "ember", "maya", 3, 1120),
    ("Field notes: a bench with the best view in town", "pale-sea", "jonas", 5, 940),
    ("Field notes: fog on the morning train", "misty-forest", "maya", 9, 1310),
    (
        "Field notes: a print shop still setting type by hand",
        "bauhaus-cool",
        "priya",
        13,
        780,
    ),
    ("Field notes: the dunes after rain", "desert-dunes", "jonas", 19, 1450),
    ("Field notes: skyline from the last tram", "city-dusk", "sam", 26, 1020),
]

ARTICLES += [
    {
        "title": title,
        "cover": cover,
        "categories": ["Field notes"],
        "author": author,
        "days": days,
        "views": views,
        "body": [
            "A short dispatch from the road: one place, one moment, one photograph.",
        ],
    }
    for title, cover, author, days, views in FIELD_NOTES
]

# Reader reviews on the most read articles: title -> [(text, stars)].
REVIEWS = {
    "Five forest walks within an hour of the city": [
        (
            "Did walk three last Sunday. The fog lifted right at the ridge, just like you wrote.",
            5,
        ),
        ("Great list. A map of the train connections would be a lovely addition.", 4),
        (
            "Café at the end of walk five was closed on a Monday, but the walk was worth it.",
            4,
        ),
    ],
    "Sand, silence and a borrowed tent": [
        ("The best travel writing I have read this year.", 5),
        ("Booked a trip after reading this. Thank you!", 5),
    ],
    "Why the best trips start with a slow train": [
        ("Finally someone who gets it. Slow trains forever.", 5),
        ("Useful tips on the tickets, saved me a fortune.", 4),
    ],
}

LANDING_PAGE = {
    "title": "Travel slower. See more.",
    "body": (
        "<h2>A magazine for slow travellers</h2>"
        "<p>Northbound publishes long reads, field notes and practical guides for "
        "people who would rather take the train. <strong>No listicles, no "
        "sponsored rankings</strong>, just good stories and better routes.</p>"
    ),
    "sections": [
        (
            "image",
            {
                "image": "blue-ridge",
                "caption": "The view from the slow train, somewhere past the third tunnel.",
            },
        ),
        (
            "text",
            {
                "body": (
                    "<h3>What you get</h3><ul><li><p>Two new stories every day</p></li>"
                    "<li><p>Downloadable routes and maps</p></li>"
                    "<li><p>A Sunday letter from the editors</p></li></ul>"
                    "<p>Free to read, always. No paywall, no tracking.</p>"
                )
            },
        ),
        (
            "columns",
            {
                "left": [
                    (
                        "image",
                        {
                            "image": "desert-dunes",
                            "caption": "Sand, silence and a borrowed tent",
                        },
                    ),
                    (
                        "text",
                        {
                            "body": "<p>Our most read story this season: three nights in the dunes with a guide who never needed a map.</p>"
                        },
                    ),
                ],
                "right": [
                    (
                        "image",
                        {"image": "misty-forest", "caption": "Five forest walks"},
                    ),
                    (
                        "text",
                        {
                            "body": "<p>Pine needles, fog and a café at the end. Five walks you can start from a train station.</p>"
                        },
                    ),
                ],
            },
        ),
    ],
}
