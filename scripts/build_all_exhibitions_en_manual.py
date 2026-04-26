import json
import re
from pathlib import Path

from deep_translator import GoogleTranslator


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "data" / "all_exhibitions.json"
TARGET_PATH = ROOT / "data" / "all_exhibitions_en.json"


MANUAL_OVERRIDES = {
    "20fd26d40c398179dd96fc14": {
        "title": "2026 TPAC Select: Four Chairs Theatre x Takumi Theatre Company, Trance",
        "locationName": "Taipei Performing Arts Center Blue Box",
    },
    "c310822d826ec798fa4c0a5e": {
        "title": "2026 TPAC Walk: Shilin Neighborhood Guided Tour",
        "locationName": "Taipei Performing Arts Center",
    },
    "c8998fbf3fbcba7e42f531f7": {
        "title": "Taipei Performing Arts Center: Scheduled Guided Tour",
        "locationName": "Taipei Performing Arts Center",
    },
    "9499e344afbafb68d6c63004": {
        "title": "Floating TPAC: VR Experience",
        "locationName": "Taipei Performing Arts Center",
    },
    "dc2018e6a1687f3fabf2df78": {
        "title": "TPAC Campus Spring 2026: Chiu An-chen - From Self to Co-Creation, Methods of Script Writing",
        "locationName": "Taipei Performing Arts Center 2F Sun Hall (Southeast Section)",
    },
    "280ec4ff44678310011f00d9": {
        "title": "2026 Taipei Children's Arts Festival: Player Marathon",
        "locationName": "Taipei Performing Arts Center Blue Box",
    },
    "e0f26310aa1ea56b46030a76": {
        "title": "2026 TPAC Select: Qudus Onikeku & QDance Company, Re:INCARNATION",
        "locationName": "Taipei Performing Arts Center Globe Playhouse",
    },
    "8aaccd704e5f2dd2edf4dc0a": {
        "title": "TPAC Campus Spring 2026: Wang Shih-wei - Between Light and Body, Generating Theatrical Perception",
        "locationName": "Taipei Performing Arts Center 2F Sun Hall (Southeast Section)",
    },
    "6dd026930431d2f291298e95": {
        "title": "2026 TPAC Select: Wanderer's Theatre, Hedda Gabler",
        "locationName": "Taipei Performing Arts Center Globe Playhouse",
    },
    "52f85b9c3f3f0d0a700d82d1": {
        "title": "2026 TPAC Select: Shu Lea Cheang x DD Dorvillier, Dream Forest: Encounter with Hagay",
        "locationName": "Taipei Performing Arts Center Globe Playhouse",
    },
    "c8212a37dc430979f1669db2": {
        "title": "Intergenerational Workshop: Sing a Song of Youth with Your Body",
        "locationName": "Taipei Performing Arts Center",
    },
    "00aa9f5ec8088da926abd532": {
        "title": "2026 TPAC Select: Berliner Ensemble, The Threepenny Opera",
        "locationName": "Taipei Performing Arts Center Grand Theater",
    },
    "00d0466b8f050ad5fbfd92d6": {
        "title": "TPAC Campus 2026: Creative Leadership - Making Space for the Arts within Systems",
        "locationName": "Taipei Performing Arts Center 2F Sun Hall (Southeast Section)",
    },
    "bcf71013b7d67badf29fb446": {
        "title": "TPAC Bilingual Story House: The Bremen Town Musicians - A Fantastic Journey",
        "locationName": "Taipei Performing Arts Center",
    },
    "834a3418e2aa5ab801dc74f1": {
        "title": "TPAC Members Exclusive: Parent-Child Workshop, Paper Sensory Lab",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 3",
    },
    "1c3271e1227642b92ae26239": {
        "title": "2026 TPAC Select: Kirill Serebrennikov, LEGEND: Ten Fragments of Parajanov",
        "locationName": "Taipei Performing Arts Center Grand Theater",
    },
    "6e826c746860cba0c31b460d": {
        "title": "2026 Taiwan International Play Reading Festival: ALL PASS",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room",
    },
    "1557528501748b92236cd26a": {
        "title": "2026 Taiwan International Play Reading Festival: Air Raid Siren",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 3",
    },
    "c6aee054c875d9f8cb83579e": {
        "title": "2026 Taiwan International Play Reading Festival: A Crazy Play",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 2",
    },
    "e3ca5c7f469b1ad9c2723b27": {
        "title": "2026 Taiwan International Play Reading Festival: Texas Aunt",
        "locationName": "Taipei Performing Arts Center",
    },
    "04dc35f6d87b456171d4d4ff": {
        "title": "2026 Taiwan International Play Reading Festival: The Thousand-Year Itch",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 2",
    },
    "b9903df7a3b94e27287120a2": {
        "title": "2026 Taiwan International Play Reading Festival: But That's Not It",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 3",
    },
    "d91bd2bc280fbf6baea365e5": {
        "title": "2026 Taiwan International Play Reading Festival: The Story of Wang Seo-Gae",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 2 / 11F Rehearsal Room 3",
    },
    "c09f8899b856702f43a57604": {
        "title": "2026 Taiwan International Play Reading Festival: A Woman from Afar",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 2 / 11F Rehearsal Room 3",
    },
    "9de7891a27d014d8210de640": {
        "title": "2026 Taiwan International Play Reading Festival: Cherry Blossom Theatre 1937",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 3",
    },
    "b1f03078d4b3dc7774219253": {
        "title": "2026 Taiwan International Play Reading Festival: The Mango Tree Never Dies",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 2",
    },
    "e8cf9ef893512cc012b564ee": {
        "title": "2026 Taiwan International Play Reading Festival: A Middle School Student's Daily Life",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 2",
    },
    "3f532bb880c901a2ff5a1332": {
        "title": "2026 TPAC Select: Tong Party Theater, White Storyteller",
        "locationName": "Taipei Performing Arts Center Blue Box",
    },
    "32f2aa8c6dd0011a43c7d317": {
        "title": "2026 Taiwan International Play Reading Festival: Takasago Theater",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 3",
    },
    "056a314f9bc21a3d455a0373": {
        "title": "2026 Taiwan International Play Reading Festival: If This Happens",
        "locationName": "Taipei Performing Arts Center 11F Rehearsal Room 2",
    },
    "728f2930be98b7a05a6021d9": {
        "title": "2026 Taipei Children's Arts Festival: Paper Mischief Escapes",
        "locationName": "Shuiyuan Theater",
    },
    "0af12cfcd8a2e1551db43f1c": {
        "title": "2026 Taipei Children's Arts Festival: Shiny Poodle",
        "locationName": "Taipei Performing Arts Center Blue Box",
    },
    "8606ce1ed7818e3c0b7de243": {
        "title": "2026 Taipei Children's Arts Festival: Tofu Flower Public Theater Edition - Brave Enough to Break Through",
        "locationName": "Shuiyuan Theater",
    },
    "b69d0fa4fd80cb4bd8290d14": {
        "title": "2026 Taipei Children's Arts Festival: Curious Cuckoo Clock",
        "locationName": "NTU Center for the Arts - You Hsin Theater",
    },
    "aed93ce699f13a3cd99727e0": {
        "title": "2026 Taipei Children's Arts Festival: Fly, My Beetle Friend",
        "locationName": "Shuiyuan Theater",
    },
    "585352fc1d9480d29ab2ac6d": {
        "title": "2026 Blue Box Focus: The Elephant in the Room",
        "locationName": "Taipei Performing Arts Center Blue Box",
    },
    "594249012fbb23a59f87a4bf": {
        "title": "2026 Taipei Children's Arts Festival: Starry Party in the Toy Kingdom - Relaxed Concert",
        "locationName": "Taipei Performing Arts Center Globe Playhouse",
    },
    "88f5de98d9f0984146f50bd1": {
        "title": "2026 Taipei Children's Arts Festival: The Moon Looks for Friends",
        "locationName": "Shuiyuan Theater",
    },
    "fe915d9a6a82b21b17f318fc": {
        "title": "2026 Blue Box Focus: Simulation Game",
        "locationName": "Taipei Performing Arts Center Blue Box",
    },
    "e595fcb0a14b95c11f2e0ae3": {
        "title": "2026 Taipei Children's Arts Festival: One, Two, Three, Don't Fall!",
        "locationName": "Taipei Performing Arts Center Blue Box",
    },
    "f75e1f24292affd8db00425b": {
        "title": "2026 Taipei Children's Arts Festival: Little Fish's Walk",
        "locationName": "Shuiyuan Theater",
    },
    "24f8f69a0c050a845e5c15c5": {
        "title": "2026 TIFA Deutsches Theater Berlin x Christopher Rüping, It's Only the End of the World",
        "locationName": "National Theater",
    },
    "7ff1640efc523201dff24263": {
        "title": "2026 TIFA Labèque Sisters: Philip Glass, Cocteau Trilogy",
        "locationName": "National Concert Hall",
    },
    "0279f7119f1a73a761737299": {
        "title": "2026 TIFA SDT Dance Production: Net",
        "locationName": "National Theater",
    },
    "4396e3caa4309f362edf6ce8": {
        "title": "2026 Youth-Senior Arts Appointment",
        "locationName": "National Theater and Concert Hall",
    },
    "5d14ed1b7a1a05da50b5d4cd": {
        "title": "2026 TIFA House Peace x ET@T, Spirit of the Beast: Call of the Skull",
        "locationName": "National Theater and Concert Hall Experimental Theater",
    },
    "f19bc910fc46c89042c446e5": {
        "title": "Hello, Ms. Pina Bausch! Parent-Child Story Session",
        "locationName": "NTCH Performing Arts Library",
    },
    "86c6e2603015f6b51473f59c": {
        "title": "[NTCH Youth Exclusive] Crystal Aesthetics Forum x Youth Live - Munich Philharmonic Principal Bass Lecture",
        "locationName": "National Theater 4F Salon",
    },
    "da70611f27adc630a2a0c3bf": {
        "title": "2026 TIFA Creative Talk: Christopher Rüping",
        "locationName": "National Theater 4F Salon",
    },
    "dcbc47235331004db492ff5f": {
        "title": "2026 Organ Outreach Concert: The Romantic Sound of Paris",
        "locationName": "National Concert Hall",
    },
    "a0b92442a2c781ff7b16132a": {
        "title": "NTCH Free Accessible Tickets for Presented Programs",
        "locationName": "National Theater / National Concert Hall",
    },
    "130a2b12a138dea0e59cf096": {
        "title": "A Bookworm Dug a Huge Pit: The Sixth Imitation of Spirit of the Beast",
        "locationName": "National Theater 4F Salon",
    },
    "585044c73b9868c4dc9c9087": {
        "title": "[Behind the Curtain] 2026 TIFA Program Guide: It's Only the End of the World",
        "locationName": "National Theater",
    },
    "a7386fe6912b8fe09b16ba8f": {
        "title": "2026 TIFA Tanztheater Wuppertal Pina Bausch: Like Moss on a Stone",
        "locationName": "National Theater",
    },
    "e7103e1fb3128812c4434e0d": {
        "title": "[Behind the Curtain] 2026 TIFA Program Guide: Like Moss on a Stone",
        "locationName": "National Theater",
    },
    "93f831c2e34dca5298621353": {
        "title": "2026 TIFA Hofesh Shechter Company: Theatre of Dreams",
        "locationName": "National Theater",
    },
    "b0a989bbfefa03563ef9c10e": {
        "title": "Baro d'Evel Creative Sharing Session",
        "locationName": "National Theater 4F Salon",
    },
    "9cdaee73edd9e8abded387de": {
        "title": "2026 TIFA Baro d'Evel: Qui Som?",
        "locationName": "National Theater",
    },
    "6249449f0e24f97ef123b8de": {
        "title": "2026 TIFA Crystal Pite x Jonathon Young: Assembly Hall",
        "locationName": "National Theater",
    },
    "a457681daa92ddf87b4ce36a": {
        "title": "2026 Organ Outreach Concert: Midsummer Jazz Dreams",
        "locationName": "National Concert Hall",
    },
    "345c7a084f284b897468b00b": {
        "title": "2026 NTCH Select: Tang Mei-yun Taiwanese Opera, Wolong: That Eternal Day (International Version)",
        "locationName": "National Theater",
    },
    "9512f58645c27773f48c4a1b": {
        "title": "2026 Innovation Series - Chen Shih-hui, Sisila ila ila: Song of Parting",
        "locationName": "NTCH Experimental Theater",
    },
    "187a85ccc918c4a8ea196dd4": {
        "title": "2026 Innovation Series - Poor Theatre, Uncle Vanya (Work-in-Progress Showing)",
        "locationName": "National Concert Hall Rehearsal Room 1",
    },
    "bdf3664886c1592bb0267b7e": {
        "title": "2026 NTCH Select: Cloud Gate Dance Theatre - A Blue Place / Come",
        "locationName": "National Theater",
    },
    "8f925cfa269d251ea2744c90": {
        "title": "2026 Innovation Series - Wu Ching-hsien, My Dormitory",
        "locationName": "NTCH Experimental Theater",
    },
    "3e713b44df0147c7bb37fa47": {
        "title": "Little Professionals Experience: Front-of-House Staff for a Day",
        "locationName": "National Theater",
    },
    "d572edb95a99aa9d22511ac0": {
        "title": "2026 Innovation Series - Chen Pin-jung x Ahi Karunaharan, The Mourning After (Work-in-Progress Showing)",
        "locationName": "National Concert Hall Rehearsal Room 1",
    },
    "9a75c68532a9a7c24f51cbc7": {
        "title": "2026 Innovation Series - Chen Yi-en, A-Fu (Work-in-Progress Showing)",
        "locationName": "National Theater Rehearsal Room A",
    },
    "fb6eaa5ddcf893e2b8c6ba0d": {
        "title": "2026 Innovation Series - Black Dog Theatre, That Voice Never Disappeared (Work-in-Progress Showing)",
        "locationName": "National Theater Rehearsal Room B",
    },
    "f75c323a7ca3eb50eff9ff01": {
        "title": "2026 Innovation Series - Against Again Troupe, Let's Dance a Dance of Death (Work-in-Progress Showing)",
        "locationName": "National Theater Rehearsal Room A",
    },
    "9a12d8105708314f2d819396": {
        "title": "2026 Innovation Series - Chuang Po-hsiang, Building a Stage That Is About to Collapse",
        "locationName": "NTCH Experimental Theater",
    },
    "38a0fe550b190ee321626561": {
        "title": "2026 Innovation Series - Wang Shih-wei, The Weak (Work-in-Progress Showing)",
        "locationName": "National Theater Rehearsal Room B",
    },
    "a91a5c4d5fc9569cb33d3d57": {
        "title": "2026 Innovation Series - Asia Re-Measurement Project",
        "locationName": "NTCH Experimental Theater",
    },
    "cf1ac6028eb0e63ddf5dcebe": {
        "title": "2026 Innovation Series - Lo Wen-chin, The Swaying Secret Room (Work-in-Progress Showing)",
        "locationName": "National Theater Rehearsal Room A",
    },
    "fecc730a91e94d5c6cc2ee43": {
        "title": "2026 Innovation Series - Ihot Sinlay Cihek & Cho Chia-an, Ina and Their Offspring (Work-in-Progress Showing)",
        "locationName": "National Theater Rehearsal Room A",
    },
    "4e4adfcb88a1a412e90e8880": {
        "title": "2026 Innovation Series - Wang Heng, Unfinished Translation: Waiting (Work-in-Progress Showing)",
        "locationName": "National Theater Rehearsal Room B",
    },
    "9e500da41f7a26627df5da8f17882aea": {
        "title": "Remote Viewing",
        "locationName": "MoNTUE, Taipei National University of Education Art Museum (No. 134, Sec. 2, Heping E. Rd., Da'an Dist., Taipei)",
    },
    "54e21d84c6348fc10ce61cdc296b342b": {
        "title": "WE Are Becoming",
        "locationName": "Taiwan Contemporary Culture Lab, C-LAB (No. 177, Sec. 1, Jianguo S. Rd., Da'an Dist., Taipei)",
    },
    "381661e1a6c3f8678aad4d14dfabccbf": {
        "title": "Mountain Stream and Whispering Pines: Solo Exhibition of Lee Mau-cheng",
        "locationName": "No. 15, Ln. 116, Sec. 1, Da'an Rd., Taipei",
    },
    "cb072af97ee03a2950b3cc9f6507de87": {
        "title": "Surrealism: Worlds in Dialogue",
        "locationName": "Taipei Fine Arts Museum (No. 181, Sec. 3, Zhongshan N. Rd., Zhongshan Dist., Taipei)",
    },
    "6f0b5e400d18606fe3f4b55df4c688f2": {
        "title": "FUTURE VISION LAB 2026",
        "locationName": "Taiwan Contemporary Culture Lab, C-LAB (No. 177, Sec. 1, Jianguo S. Rd., Da'an Dist., Taipei)",
    },
    "7f7abcea6c285e7795a2094f8e7d4cb8": {
        "title": "Night Wanderer: Chia-Hsin Lien Solo Exhibition",
        "locationName": "2F, No. 218-6, Sec. 4, Zhongxiao E. Rd., Da'an Dist., Taipei",
    },
    "eb8d32b106a499713f27cdfb9a8b459a": {
        "title": "Four Rolling Nights - Artist Salon (May 12-15, Registration Open)",
        "locationName": "Taishin Renai Building, 12F Conference Room (No. 1, Sec. 4, Ren'ai Rd., Da'an Dist., Taipei)",
    },
    "a8670ab0fda7f395ff973f9be182f290": {
        "title": "One Leaf, One Mountain: 2026 Chiu Kuo-feng Solo Exhibition",
        "locationName": "Astar Gallery (No. 9, Aly. 53, Ln. 63, Sec. 2, Dunhua S. Rd., Taipei)",
    },
    "aa7ac335611dd297266bb0c3386ba724": {
        "title": "The Alchemy of Wool: Oksana Pero Debut Solo Exhibition",
        "locationName": "one little planet (No. 13, Dongfeng St., Da'an Dist., Taipei)",
    },
    "b1d582588ecd110a0b4f91d8579240df": {
        "title": "Morning Bath: Hsu Yu-yi Solo Exhibition",
        "locationName": "Gallery 80A (3F, No. 192, Sec. 6, Zhongshan N. Rd., Shilin Dist., Taipei)",
    },
    "b3cb132c00def43ff61ee9f708e6fe5d": {
        "title": "Seven-Day Conversations: Tsai Pou-ching Solo Exhibition",
        "locationName": "MoCA Studio, Museum of Contemporary Art Taipei (No. 39, Chang'an W. Rd., Datong Dist., Taipei)",
    },
    "25cae5641cdac0252b07d8dc": {
        "title": "2026 Picture Book Forest at Huashan / Qidong: May Limited Special Courses",
        "locationName": "3 to 5 minutes on foot from Huashan Taipei store",
    },
    "28c05a2cb9727ae777654457": {
        "title": "ECHO Puppetry Tea Time: Reincarnating Object Souls from Daily Items to Stage Leads",
        "locationName": "Taipei Puppet Theater Workshop Classroom",
    },
    "df547e18dbf2a0be2679b29f": {
        "title": "Sketch Taipei with an Illustrator Guide: A Walk to Art Garden",
        "locationName": "Meet at 12:50 at the Art Garden entrance (inside the building)",
    },
    "56ccafef1c48f8dc678107cf": {
        "title": "Mastering the Market for Great Shows: 2026 Theater Marketing Forum",
        "locationName": "Taipei Children's Amusement Park DDBox",
    },
    "1c136644aceb3cb5f20f18eb": {
        "title": "Romantic Wheat Sound 03: Chanson Afternoon - Jin Huang x Chung-Hua Weng",
        "locationName": "HeHe Cultural Space Black Box",
    },
    "a2c30465d9298e8b45f6ccc8": {
        "title": "Lecture on Taoyuan Ponds and Vanishing Ghost Rice",
        "locationName": "Near Wanhua Railway Station",
    },
    "1f3df2fffb6775ee5487b6d9": {
        "title": "Music and Rhythm Workshop: The Viennese Favorite March",
        "locationName": "Taiwan Contemporary Culture Lab, C-LAB Rehearsal Bar",
    },
    "05cf98751a8a8bef998f6dd5": {
        "title": "Drama Dance Is Party: May Sessions",
        "locationName": "Upstairs via the staircase next to the 7-Eleven entrance",
    },
    "bbc019804d48de2b641b70ec": {
        "title": "Glimmer International Early Music Festival: Spanish Renaissance Court Dance Banquet Workshop and Ball",
        "locationName": "Glimmer Peacock Hall",
    },
    "44087bd2d9df5611b873354f": {
        "title": "i-dle Dance Beginner Class",
        "locationName": "Within 1 minute on foot from MRT Taipei Main Station Exit M3",
    },
    "ac05464544599244cece2382": {
        "title": "Travel Photography Course: A No-Regret Travel Shooting Guide (May Class)",
        "locationName": "If the venue changes, participants will be notified by phone",
    },
    "1359421cb078346d7b40aa22": {
        "title": "2026 Solo Dance: 3rd Choreographic Platform Performance",
        "locationName": "Huashan 1914 Creative Park, Central Building 3, 2F Arch Hall",
    },
    "10f0c1325e80eca3b285dc58": {
        "title": "Little Music Masters Class: Double Woodwinds x Sleeping Beauty (Taipei)",
        "locationName": "1980 Chamber Music Hall",
    },
    "e245fb14f2ed6abc71c6217d": {"title": "TDI On-Camera Acting x Drama Audition Foundations", "locationName": "Catwalk Group (TDI Taiwan Dream Institute)"},
    "49cdf90380a76136d44f8b78": {"title": "Sunset-Themed Oil Painting Experience (Jun 7, 14:00-16:30)", "locationName": "Includes materials, canvas, and dessert"},
    "fc2a786e79142cec473806fb": {"title": "Ming Shi Ensemble Rising Star Concert: Tayovan Trio", "locationName": "Ming Shi Music Space"},
    "9d186cd15d819d50913d3863": {"title": "Chill Mother's Day Feast: Rooftop Cinema x Dessert x Cocktail", "locationName": "DREAM PLAZA Sky Garden"},
    "4360f2871e4e3af81756f93c": {"title": "Soundtracks for Human Ambient Listening Session", "locationName": "ANKR Studio"},
    "eabad35557ee563ff645b731": {"title": "Online Film Lecture: Escaping Venus", "locationName": "Next to Like Parking Lot"},
    "2e6084b8220a9abd9a076f73": {"title": "2026 Hand-Carved Seal Aesthetics", "locationName": "Near MRT Wanlong Station, 5-minute walk"},
    "69b92c23768375aba67a7349": {"title": "April 2026 Music Comedy Open Mic (Host: Yi-Cen)", "locationName": "Place"},
    "17feab4161a924d8f3a02fed": {"title": "YOUC Mandala Art Healing Workshop", "locationName": "Youxi Spiritual Healing Center"},
    "e5c305567e448975b5d2b487": {"title": "Art Meetup: Travel with Art 2026", "locationName": "MRT Nanjing Sanmin Station Exit 3"},
    "fa31a939ba3050b4e5b29af9": {"title": "Amrita Stage Performance", "locationName": "Guling Street Avant-Garde Theatre 2F"},
    "cf99cb0db49a0288ea2d7c3c": {"title": "Mother's Day Special Reservation Gift at Jiufangtian", "locationName": "Jiufangtian Food & Art Restaurant"},
    "00cd5b805921c686a31a4fe7": {"title": "Civic Dialogue: Songs from Afar", "locationName": "Near MRT Zhongxiao Fuxing / Nanjing Fuxing"},
    "f04a3fb630bcab7ad90ac15f": {"title": "Art Healing Class: Save a Seat for Yourself", "locationName": "Sheng Sheng Space"},
    "07a8e4b5af1eab4fbe841393": {"title": "Pet Portrait Watercolor Class (May Session)", "locationName": "1F, No. 26, Ln. 95, Sanmin Rd., Songshan Dist., Taipei"},
    "b9c5c7a4d9dc297ff02c8f08": {"title": "Art Healing Workshop: Seeing Your Inner State through Painting", "locationName": "Social Innovation Lab, Room 203"},
    "b7240fefe5b3a27e280907a7": {"title": "Producer-Selected Actor Development Program 2026 (Advanced)", "locationName": "Near MRT Sun Yat-sen Memorial Hall Exit 2"},
    "f508d346796025fdea950201": {"title": "Lecture Series: Theater and Phenomenon", "locationName": "Art Gathering Life Lecture Hall"},
    "ed4f02c58e7646eca7d3bf14": {"title": "Improvisation Co-Creation: Let Art Flow Between Us", "locationName": "Nomad Project"},
    "f78b1076630af58d0dbbbdb4": {"title": "2026 Formosa International Organ Festival Salon", "locationName": "Wangchunfeng Culture and Arts Foundation"},
    "091f2dd537e0106d54f18ad7": {"title": "Tipsy Light Flow: Alcohol Ink Art Healing Experience", "locationName": "2F, No. 2, Ln. 38, Nanyang St., Zhongzheng Dist., Taipei"},
    "ac8f30dbb3771407ec0874a9": {"title": "Play Mature Life Intro Experience: ZUMBA (May)", "locationName": "MRT Zhongxiao Fuxing Exit 4, 1-minute walk"},
    "567726650c7859370c4d585b": {"title": "Urban Sketching Talk with Painter Wang Jie", "locationName": "Entrance aisle beside parking lot"},
    "8cfb4c68550b381b2ee7b905": {"title": "Improv Showcase B08 Short Form Graduation Performance", "locationName": "basis coffee basement"},
    "323a4fd6efdec78837e5ab78": {"title": "Photo Walk: Chifeng Street", "locationName": "Meet at MRT Zhongshan Station Exit 6"},
    "344927c6548fd4263ba103a2": {"title": "Blue Ocean Night in May: Worry-Relief Oracle Card Shop", "locationName": "Across from Q Square Taipei"},
    "b4f51a6cf92152840de08dba": {"title": "Warm May Botanical Illustration Class", "locationName": "NOKE Zhongtai Le Sheng 3F Uncanny Space"},
    "da4629d164059aa3fb307b5d": {"title": "Inner Pastel Healing Art: A Gift to Yourself", "locationName": "Tree House 4F, Room 405"},
    "61ce9ef4e52aa8220bb8120b": {"title": "2026 Personal Branding Portrait Session (May & July)", "locationName": "Near MRT Sun Yat-sen Memorial Hall Exit 2"},
    "80fa031f1a262bf391f8ee05": {"title": "Everyone Can Be an Impressionist Master: Oil Pastel Experience", "locationName": "Address provided before class by email"},
    "63ef217c31be352145f9ff2b": {"title": "platform A Second Creator Open Call", "locationName": "platform A"},
    "6913fb2607f374a51cc171df": {"title": "Modern Huagang: Art Legacy", "locationName": "Huagang Museum 4F"},
    "6955575326b32416dc3491e4": {"title": "2026 Sing Our Songs: Pop Music Story Exhibition", "locationName": "Taipei Music Center Cultural Cube"},
    "693c63b126b32416dc348c44": {"title": "2026 Hung Wei-che Merch Pavilion", "locationName": "Merchandise"},
    "69a0b2b726b32454e437cb64": {"title": "Hu Ke-min Ink Hundred Flowers Original Exhibition", "locationName": "Da'an District, Taipei"},
    "69a0b2ba26b32454e437cb65": {"title": "Casting the Spirit: Shang-Zhou Bronze Casting Techniques", "locationName": "Academia Sinica Institute of History and Philology Museum"},
    "69557cfa26b32416dc3491e5": {"title": "SEVENTEEN Lyrics Postcard Kit", "locationName": "Merchandise"},
    "69714c8726b3243b1ca0c15a": {"title": "Messages of Blessing: Mailbox and Postbox Stamp Exhibition", "locationName": "Postal Museum Taipei"},
    "69c4a475eb43f81479e547eb": {"title": "Hanseong Alley - A Bookstore and an Academy", "locationName": "Hanseong Alley"},
    "69c5d8cf26b3242a48a9de9d": {"title": "Ancient Spirits, Contemporary Curiosities: 21st Century Bronze Collection", "locationName": "Exhibition Hall 3"},
    "69c5d8cf26b3242a48a9de9c": {"title": "The Beauty of Needlework: Embroidery and Textile Conservation Exhibition", "locationName": "Aesthetic Space"},
    "696bc0dd26b3243b1ca0c08b": {"title": "Radiant Renewal: 2026 Chinese Flower Arrangement Exhibition", "locationName": "Songshan Cultural and Creative Park Warehouse 4"},
    "69df4932eb43f81479e54816": {"title": "b.wing Solo Exhibition: We Are All the Happy Prince", "locationName": "Low Room May Landscape"},
    "69cd4fb526b3242a48a9dfff": {"title": "Newbie Village Program", "locationName": "PLAYground Nan Village Theater"},
    "69e24cff647abc72d0362366": {"title": "Fu Jen University Graduation Exhibition: 29 Bold", "locationName": "Songshan Cultural and Creative Park Warehouse 1"},
    "69e1332426b3242a48a9e3ec": {"title": "Korean Stage Play: Beautiful Life", "locationName": "Taipei City Arts Promotion Office Arts Building"},
    "6978f23f26b32454e437c473": {"title": "2026 Outstanding Dynamics Music Award Concert", "locationName": "Taipei Zhongshan Hall Guangfu Hall"},
    "6984cd5126b32454e437c731": {"title": "Glove Puppetry: Fan Lihua Moves Mountains and Seas", "locationName": "Dadaocheng Theater Quyi Venue"},
    "69ea82f626b3242a48a9e60c": {"title": "Weekend Easy Talk: Art and Literature", "locationName": "Taipei City Arts Promotion Office Arts Building"},
    "694190c426b32416dc348cdf": {"title": "Taipei Seagull Theater: The Female Ghost Returns Home", "locationName": "Dadaocheng Theater"},
    "698e07da26b32454e437c936": {"title": "2026 Closer International Arts Festival: Loved Tonight!?", "locationName": "Si Theater"},
    "698cb66026b32454e437c8db": {"title": "2026 Annual Performance: Traces", "locationName": "NTU Center for the Arts You Hsin Theater"},
    "69a5c2d226b32454e437cbe9": {"title": "2026 Yi-Hui Lin Flute Recital: Voices from the North", "locationName": "NTCH Recital Hall"},
    "694979d426b32416dc348f82": {"title": "2026 Taiwan Traditional Theatre Festival: Li Houzhu", "locationName": "Taiwan Traditional Theatre Center Grand Theater"},
    "674de83326b324689882a4b2": {"title": "Cultural Tourism Traditional Performing Arts Theater: Taipei EYE", "locationName": "TCC Building Shimin Hall"},
    "69c6b85726b3242a48a9dea2": {"title": "NTUA 2026 Spring-Summer Series: Art Garden Melodies", "locationName": "National Taipei University of the Arts Concert Hall"},
    "6939a7ec26b32416dc348b87": {"title": "Off-Broadway Musical: I Love You, You're Perfect, Now Change", "locationName": "PLAYground Nan Village Theater"},
    "693af97826b32416dc348c01": {"title": "In the Palm: Pipa Masters Night", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "69c1724d26b3242a48a9dd7c": {"title": "After the Spring Equinox, the Moon Is Full", "locationName": "Nanhai Theater, National Taiwan Arts Education Center"},
    "698e07da26b32454e437c934": {"title": "Guling Street Avant-Garde Theatre: Read for You XI", "locationName": "Guling Street Avant-Garde Theatre 1F Experimental Theater"},
    "69837bd526b32454e437c6e6": {"title": "Shin Shunyu Manzai Special: BOOK!", "locationName": "Comedy Plus"},
    "69a5c2dc26b32454e437cbf3": {"title": "Absurd Sublet", "locationName": "Liang Shiqiu Residence"},
    "69c5d8cf26b3242a48a9de9f": {"title": "Echoes", "locationName": "Exhibition Halls 1 and 2"},
    "6938567f26b32416dc348b4a": {"title": "Heartbreak Inside Marriage", "locationName": "Shuiyuan Theater"},
    "69b04eb826b3242a48a9d981": {"title": "From Prayer to Eternity: A Journey through the Soul", "locationName": "Taipei Philharmonic & Mather Music Cultural Hall"},
    "69837bbf26b32454e437c6e3": {"title": "Fuyu Chamber Ensemble: Trio Fusion", "locationName": "NTCH Recital Hall"},
    "69badace26b3242a48a9dc55": {"title": "Original Korean Stage Play: Beautiful Life", "locationName": "Taipei City Arts Promotion Office City Stage"},
    "69a865c626b3242a48a9d7ee": {"title": "2026 Cool Cloud Theater Live Peking Opera", "locationName": "TCC Building Shimin Hall"},
    "6965294526b3243dd4e6ad02": {"title": "2026 BaoLuo WALK: Do Re Mi Fa Spring", "locationName": "Comedy Plus"},
    "6931bf0d26b32445dce6f5d2": {"title": "BNP Paribas Wealth Music Tour: Memory of Two Cities", "locationName": "National Concert Hall"},
    "69ea82f626b3242a48a9e60e": {"title": "Music Salon: Spring Reflections", "locationName": "Taipei City Arts Promotion Office Arts Building"},
    "694c1cc826b32416dc34906a": {"title": "Following: 2026 Huqin Recital by Wu Meng-shan", "locationName": "NTCH Recital Hall"},
    "698cb65026b32454e437c8d7": {"title": "Zither Resonance: Mountain and Sea Concert", "locationName": "NTCH Recital Hall"},
    "69ab08be26b3242a48a9d8df": {"title": "2026 Spring Sing: i A Cappella Concert", "locationName": "CPC Building Guoguang Hall"},
    "69ea831626b3242a48a9e61c": {"title": "Japan Music Time Map", "locationName": "Taipei Zhongshan Hall"},
    "696a6f5126b3243b1ca0c031": {"title": "Taipei Philharmonic: Mozart's Wedding Gift - Mass in C Minor", "locationName": "National Concert Hall"},
    "69a5c2d226b32454e437cbed": {"title": "Minsheng Community Wind Band 2026 Regular Concert I", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "69bd7dd526b3242a48a9dd1f": {"title": "Fluxingers Tamkang Tingtao Choir 2026 Concert: Because of Love", "locationName": "NTCH Recital Hall"},
    "69837bbf26b32454e437c6e4": {"title": "Erhu Recital by Tsai Chung-chi", "locationName": "NTCH Recital Hall"},
    "69ea82f626b3242a48a9e60d": {"title": "Arts Afternoon Tea: Qualification of Being 'Female'?", "locationName": "Taipei City Arts Promotion Office Arts Building"},
    "695405d426b32416dc34919a": {"title": "2026 Liching Arts Feast: Munich Philharmonic x Seong-Jin Cho", "locationName": "National Concert Hall"},
    "6929d60b26b32445dce6f3f6": {"title": "2026 TSO Master Series: Inbal Conducts Mahler No. 7", "locationName": "National Concert Hall"},
    "69a5c2dc26b32454e437cbf0": {"title": "Taipei Fuhsing High School Drama Class 27th Graduation Show: Zero Location", "locationName": "Taipei Fuhsing High School Mountain Theater"},
    "698cb65026b32454e437c8d6": {"title": "Yun: 2026 Cello Recital by Tang Ying-chi", "locationName": "NTCH Recital Hall"},
    "694979d426b32416dc348f86": {"title": "2026 Taiwan Traditional Theatre Festival: The Two Eyes - See Shim Chung", "locationName": "Taiwan Traditional Theatre Center Grand Theater"},
    "69c566d826b3242a48a9de82": {"title": "TenbaLa! Buddy 10th Anniversary Concert", "locationName": "Taipei Zhongshan Hall Guangfu Hall"},
    "697f874c26b32454e437c659": {"title": "Chinese Culture University Drama Dept. 60th Graduation Show", "locationName": "Taipei Hakka Music and Theater Center 2F Theater"},
    "695405d426b32416dc34919b": {"title": "Allianz Symphony Night 2026: Munich Philharmonic", "locationName": "National Concert Hall"},
    "69d1443526b3242a48a9e0e3": {"title": "I Am Just a Soldier", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443726b3242a48a9e11a": {"title": "I Am in Nanyang + Crimson Sun", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443526b3242a48a9e0e6": {"title": "Gu's Story Collection", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e116": {"title": "Stranger Shorts #1", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e100": {"title": "The Wind Still Blows over the Graves", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e0ee": {"title": "Nanawa Coming-of-Age Chronicle", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443826b3242a48a9e120": {"title": "At the Edge of the Killing Fields", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443826b3242a48a9e124": {"title": "Berry Good Life", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e0e9": {"title": "Kabul, Between Faiths", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443526b3242a48a9e10d": {"title": "Marching toward the Soul", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e102": {"title": "Displaced Outside the Frame: Revolution until Victory", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443726b3242a48a9e11c": {"title": "How Long the Road Is", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "699f2b5526b32454e437cb27": {"title": "Fuli Boy: Doing Comedy Is the Happiest Thing", "locationName": "Comedy Plus"},
    "69d1443726b3242a48a9e11b": {"title": "Green Horizon + Military Instructors: Story of Taiwan's Training Corps", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "697ce48326b32454e437c5c9": {"title": "NTU Drama Department 24th Graduation Production: Forgotten Melody", "locationName": "NTU Center for the Arts You Hsin Theater"},
    "69d1443526b3242a48a9e0d8": {"title": "Compact Disc + Memory Coordinates", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69a9b72926b3242a48a9d878": {"title": "2026 Baritone Ding Yi-hsien Recital: Love and Life", "locationName": "NTCH Recital Hall"},
    "69d1443526b3242a48a9e0e0": {"title": "Parajanov, What Did You Dream Last Night?", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "694c1cc826b32416dc34906e": {"title": "Hakka Opera: Spring Breeze on the Honor Roll", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "69d1443526b3242a48a9e0e5": {"title": "Diary of an American Tiny-Home Family", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69b837d426b3242a48a9dc02": {"title": "Dance 8006 8th Annual Performance", "locationName": "Taiwan Traditional Theatre Center Small Theater"},
    "69d1443526b3242a48a9e0e2": {"title": "Writing Hawa", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e0f9": {"title": "Some Dreams in the Fire-Room", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e0ec": {"title": "Broken R", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443526b3242a48a9e0f0": {"title": "Wild Uncle's Cat Quest", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443726b3242a48a9e11d": {"title": "Wings of Takasago", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443526b3242a48a9e115": {"title": "Xiangzi Shop: On Stage", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "6980d8b426b32454e437c660": {"title": "String Reflections: 2026 Violin Recital by Huang Yu-ting", "locationName": "NTCH Recital Hall"},
    "69d1443526b3242a48a9e0f7": {"title": "Legendary Diva Kao Chu-hua", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e0f1": {"title": "With Hassan in Gaza", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443526b3242a48a9e0e7": {"title": "Hair, Paper, Water...", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "699c886626b32454e437ca52": {"title": "Chien Tzu-hsun x Transformations of Things", "locationName": "Taiwan Traditional Theatre Center Small Stage"},
    "69d1443526b3242a48a9e113": {"title": "Under the Fallen Nest", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443526b3242a48a9e0f8": {"title": "Leaving: A Living Scene", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e0f6": {"title": "Color Sampling.mov", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e0db": {"title": "Child of the Poppy", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e0d7": {"title": "The Cherry Vessel", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e0d6": {"title": "Air Base", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e103": {"title": "R21: Repairing Solidarity", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443826b3242a48a9e128": {"title": "RIDM Shorts #2", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443826b3242a48a9e12b": {"title": "Videotage x Forum Lenteng: Scales of Light", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443526b3242a48a9e112": {"title": "Confession of a Mole", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69de731826b3242a48a9e2fb": {"title": "Phantom Wind Symphony 2026 Spring Concert", "locationName": "Soochow University Songyi Hall"},
    "69d1443526b3242a48a9e0f3": {"title": "Taiwan Competition Shorts #2", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e0ef": {"title": "Our Road to Freedom", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443526b3242a48a9e0f4": {"title": "A Mango Tree at Home", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "68dd602626b324253c0d9f75": {"title": "The Thinker - Potra Plays Complete Bach Cello Suites", "locationName": "National Concert Hall"},
    "69d1443826b3242a48a9e125": {"title": "Island Fragments of Light", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e0df": {"title": "Until the Orchids Bloom", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e114": {"title": "To Alexandra", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443526b3242a48a9e111": {"title": "Hong Kong Shorts Program", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443826b3242a48a9e12d": {"title": "Desert Sea", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e0f5": {"title": "Bones Last Longer than Feathers", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e0dc": {"title": "The Covered Yi-shan", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "694c1cc826b32416dc34906c": {"title": "New Music Wave II: TCO Academy Chinese Orchestra Concert", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "69d1443526b3242a48a9e0eb": {"title": "Past-Future Continuous Tense", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443526b3242a48a9e0e1": {"title": "Man-mei + Where the Sea Breeze Reaches", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e0e4": {"title": "Death of Violent Images", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443526b3242a48a9e0d9": {"title": "Noise + Monster Rider Tale", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e0fa": {"title": "Xi Xi", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e0ea": {"title": "Nocturne of the Hawk Moth", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443526b3242a48a9e101": {"title": "Karima Abed Frame + Silent Protest + To the Divide", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443626b3242a48a9e119": {"title": "Taiwan Slice Shorts Program", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443526b3242a48a9e10a": {"title": "Foreign Parts", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e0dd": {"title": "True Dream: Healing Time", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69a07ccc26b32454e437cb5b": {"title": "Sounds of Nature: Qingyun Choir 2026 Annual Concert", "locationName": "National Concert Hall"},
    "699c885426b32454e437ca43": {"title": "Huqin Recital by Huang Wei-lun", "locationName": "NTCH Recital Hall"},
    "69d1443526b3242a48a9e0e8": {"title": "Temporary Daily Life", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443526b3242a48a9e0ed": {"title": "Memory of the Butterfly", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443826b3242a48a9e127": {"title": "RIDM Shorts #1", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e0f2": {"title": "Taiwan Competition Shorts #1", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443526b3242a48a9e107": {"title": "The Night We Stand Still + I Dance, Therefore I Am", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69e9cc27647abc72d0362371": {"title": "Excellent Italian Design: Making _____ Real", "locationName": "Songshan Cultural and Creative Park, Taiwan Design Museum Hall 02"},
    "69d5389526b3242a48a9e149": {"title": "Fate and Strings: A Tchaikovsky Night", "locationName": "National Concert Hall"},
    "69b4434926b3242a48a9db71": {"title": "Voice of a Monarch: Yuri Nakajima Piano Recital", "locationName": "NTCH Recital Hall"},
    "69d1443526b3242a48a9e0de": {"title": "Family Affairs", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e0da": {"title": "Past, Present, What I Will Be", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e108": {"title": "Battlefield Phantom Hymn + A Freedom Fighter's Film", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69837bbf26b32454e437c6e5": {"title": "String Masterpieces: NTUA Fu-Zhou Strings x Little Giant Chinese Chamber Orchestra", "locationName": "NTCH Recital Hall"},
    "69cad73e26b3242a48a9df5a": {"title": "2026 New Aspect Symphony Orchestra Annual Concert I", "locationName": "National Concert Hall"},
    "69d1443526b3242a48a9e105": {"title": "Tracing Old Streets + A Stone Away + Airspace Diary", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69d1443526b3242a48a9e104": {"title": "The King and the Extra", "locationName": "SPOT Huashan Cinema, Hall 2"},
    "69bd7dd526b3242a48a9dd1c": {"title": "Song of Strings: 2026 Taipei Philharmonic Youth Strings Concert", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "69d1443526b3242a48a9e0fe": {"title": "Witness of Civilization", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69d1443526b3242a48a9e0fc": {"title": "Underground", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443826b3242a48a9e11f": {"title": "Asia as One", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69bd7dd426b3242a48a9dd14": {"title": "Chen Zheng Ensemble: Following Mazu into the Concert Hall", "locationName": "NTCH Recital Hall"},
    "69d1443526b3242a48a9e0fb": {"title": "Inle Lake Echoes + Narrative Exercise", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e10b": {"title": "Liveda: Poem of the Earth Sea", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69badac326b3242a48a9dc4f": {"title": "Soprano Tsai Yun-hsuan Recital", "locationName": "NTCH Recital Hall"},
    "69d1443826b3242a48a9e12a": {"title": "Water / Between Non-Water", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69d1443826b3242a48a9e126": {"title": "Geobone Islands + Soldier's Lake", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 1"},
    "69d1443526b3242a48a9e117": {"title": "Stranger Shorts #2", "locationName": "SPOT Huashan Cinema, Hall 1"},
    "69725c1f26b32454e437c3b7": {"title": "The Stolen Fire Troupe: Bear in the Forest", "locationName": "Shuiyuan Theater"},
    "69d1443526b3242a48a9e109": {"title": "Lush Green Grass", "locationName": "Taipei Shin Kong Cinemas (Lion Forest), Hall 3"},
    "69b1a03f26b3242a48a9d9ee": {"title": "Percussion Classics: Sound and Image Interwoven", "locationName": "Taipei Performing Arts Center Blue Box"},
    "681fa5d226b3242b74a3ba7f": {"title": "2026 International Shen Wen-cheng Day: Xiaoliuqiu Love Song Concert", "locationName": "Taipei International Convention Center"},
    "699c885426b32454e437ca45": {"title": "Taiwan International Early Music Festival: The Heart of Zimmerman I", "locationName": "NTU Center for the Arts Yasunari Hall"},
    "697106f826b3243b1ca0c133": {"title": "Yi-shan Lu Piano Recital: Russian Moods", "locationName": "NTCH Recital Hall"},
    "69b4436126b3242a48a9db76": {"title": "Papaya 2026 Short Play Special: B", "locationName": "Hsin-Yi Living Plaza Zhi-Xin Theater"},
    "693af97826b32416dc348c02": {"title": "Songs of the Island: Chang Yu-an & TCO", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "699c886626b32454e437ca4b": {"title": "Taipei Yuda High School Performing Arts 9th Graduation Show", "locationName": "Nanhai Theater, National Taiwan Arts Education Center"},
    "69822a3926b32454e437c68d": {"title": "Taiwan Zheng Ensemble Founding Concert: Inheriting Resonance with New Voices", "locationName": "Eslite Performance Hall"},
    "697b92c526b32454e437c56c": {"title": "Lee-Ming Institute of Technology Graduation Production: Devour", "locationName": "Taiwan Traditional Theatre Center Small Theater"},
    "69cbfe1526b3242a48a9df67": {"title": "111 Quintet World Harmonica Festival Prizewinner Concert", "locationName": "NTU Center for the Arts Yasunari Hall"},
    "6931bf0d26b32445dce6f5d3": {"title": "2026 Europe Day Series: NSO Symphony of Light", "locationName": "National Concert Hall"},
    "69b594b426b3242a48a9dbe8": {"title": "Scarlatti's Spanish Landscape", "locationName": "NTCH Recital Hall"},
    "69a9b72926b3242a48a9d87b": {"title": "TJO Tribute to Jazz Giants 4: Miles and Coltrane Centennial", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "69cff2c226b3242a48a9e0ce": {"title": "Huagang Arts Exhibition: Thus the Spring Breeze", "locationName": "National Concert Hall"},
    "69d92d2126b3242a48a9e21f": {"title": "2026 University of Taipei Concerto Night", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "69bd7dd526b3242a48a9dd1d": {"title": "Who Can Match: Tseng Keng-yuan & TPYE", "locationName": "NTCH Recital Hall"},
    "6929d60b26b32445dce6f3f7": {"title": "2026 TSO Master Series: Bernstein Kaddish Taiwan Premiere", "locationName": "National Concert Hall"},
    "69dcc004647abc72d0362346": {"title": "Hanseong Alley - Beautiful Chinese Characters", "locationName": "Hanseong Alley"},
    "697a413526b32454e437c4eb": {"title": "Song of the Dharma & A Piano Concerto Journey", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "69cd4fa026b3242a48a9dfd9": {"title": "Yi Realm: Zheng Recital by Tung Yen-pin", "locationName": "NTCH Recital Hall"},
    "69cea12726b3242a48a9e072": {"title": "Entertainer Era: No Chaos in Class Meeting!", "locationName": "Comedy Plus"},
    "69eba23826b3242a48a9e64d": {"title": "2026 Oops Play Reading Festival: From Unread to Read", "locationName": "Oops Creative Society"},
    "697ce46026b32454e437c5be": {"title": "12th Taiwan International Percussion Festival: Ju Percussion Group", "locationName": "National Concert Hall"},
    "6980d8c626b32454e437c667": {"title": "18th New Vision for New Talent", "locationName": "NTCH Experimental Theater"},
    "697ce46026b32454e437c5c0": {"title": "12th Taiwan International Percussion Festival: Chang Chun-liang & Quyi Duo", "locationName": "National Concert Hall"},
    "694979d426b32416dc348f89": {"title": "2026 Taiwan Traditional Theatre Festival: Golden and Silver Tengu", "locationName": "Taiwan Traditional Theatre Center Grand Theater"},
    "694c1cc826b32416dc34906b": {"title": "Ambush from Ten Sides: 2026 Oriental Instrumental Theater", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "69e50a9c26b3242a48a9e55b": {"title": "NTUA 2026 Spring-Summer Series: NTUA Jazz Big Band Concert", "locationName": "National Taipei University of the Arts Concert Hall"},
    "699c885426b32454e437ca40": {"title": "Taiwan International Early Music Festival: The Heart of Zimmerman I - Twin Tones", "locationName": "NTCH Recital Hall"},
    "69a5c2dc26b32454e437cbf4": {"title": "People in the Shed Theatre x Chao Chiao-min: Three Flowers", "locationName": "Guling Street Avant-Garde Theatre 1F Experimental Theater"},
    "69cd4fb426b3242a48a9dff3": {"title": "Huagang Art School 49th Drama Graduation Performance: Era of Feeding", "locationName": "Nanhai Theater, National Taiwan Arts Education Center"},
    "69a5c2dc26b32454e437cbf2": {"title": "Trend Literature Theater: Li Shangyin, Untitled, Even AI Can't Decode", "locationName": "Taipei City Arts Promotion Office City Stage"},
    "69aefd8026b3242a48a9d941": {"title": "Love under the Aurora", "locationName": "Shuiyuan Theater"},
    "69b2f1b826b3242a48a9db15": {"title": "2026 TSO Chamber Salon: Venetian Love", "locationName": "NTCH Recital Hall"},
    "6939a7e726b32416dc348b80": {"title": "2026 Eslite Chamber Music Festival: Echoes across Centuries", "locationName": "Eslite Performance Hall"},
    "6984cd5126b32454e437c732": {"title": "Glove Puppetry: Shengping Wuzhouyuan - Huaguang Subdues Li Lou and Shi Kuang", "locationName": "Dadaocheng Theater Quyi Venue"},
    "699dd9e126b32454e437ca85": {"title": "Taiwanese Opera: The Martyr's Tale", "locationName": "Dadaocheng Theater"},
    "697ce46126b32454e437c5c3": {"title": "12th Taiwan International Percussion Festival: Handpan & Darbuka Concert", "locationName": "National Concert Hall"},
    "697ce46026b32454e437c5c2": {"title": "12th Taiwan International Percussion Festival: Groove Percussion Trio", "locationName": "National Concert Hall"},
    "697ce46026b32454e437c5c1": {"title": "12th Taiwan International Percussion Festival: Tangled Taiko Ensemble", "locationName": "National Concert Hall"},
    "69ac5a3826b3242a48a9d931": {"title": "NTUA 2026 Spring-Summer Series: NTUA Faculty Chamber Music", "locationName": "National Taipei University of the Arts Concert Hall"},
    "69da7eac26b3242a48a9e282": {"title": "Coastal Frontiers: A Drifting Life against Pirates", "locationName": "Huashan 1914 Creative Park East 3B, Wumei Theater"},
    "69b837c526b3242a48a9dbfa": {"title": "German-French Classical Dialogue", "locationName": "NTCH Recital Hall"},
    "699c885426b32454e437ca46": {"title": "Boris Berman Piano Recital: Realm of Reason and Feeling", "locationName": "NTCH Recital Hall"},
    "697ce46126b32454e437c5c6": {"title": "12th Taiwan International Percussion Festival: Habana Jazz Quartet", "locationName": "National Concert Hall"},
    "697ce46126b32454e437c5c4": {"title": "12th Taiwan International Percussion Festival: 100-Person Marimba", "locationName": "National Concert Hall"},
    "697ce46126b32454e437c5c5": {"title": "12th Taiwan International Percussion Festival: Udu & Darbuka Masters", "locationName": "National Concert Hall"},
    "69e267c426b3242a48a9e465": {"title": "30th Anniversary of Pro-Arte Music Collective: Concert and Lecture Series", "locationName": "Pro-Arte Music Theater"},
    "69b9893e26b3242a48a9dc32": {"title": "Sen Woodwind Trio: Forest Resonance", "locationName": "NTCH Recital Hall"},
    "694c1cc826b32416dc34906d": {"title": "Symphony of Silk and Bamboo: TCO Youth Chinese Orchestra Concert", "locationName": "Taipei Zhongshan Hall Zhongzheng Auditorium"},
    "69a865c626b3242a48a9d7f0": {"title": "Hot Broadway: Lord Zhou Chu Buys Perfume", "locationName": "Taipei Performing Arts Center Globe Playhouse"},
    "697f873726b32454e437c656": {"title": "Borderless Resonance: Asuka Malay x Satoru Kitamura", "locationName": "NTCH Recital Hall"},
    "69a5c2d226b32454e437cbe4": {"title": "Chi-jui Lee Piano Recital", "locationName": "National Concert Hall"},
    "699f2b4426b32454e437cb20": {"title": "Little Giant Chinese Chamber Orchestra Young Artist Series: Bloom XVII", "locationName": "NTCH Recital Hall"},
    "698e07cd26b32454e437c92c": {"title": "No Self? Vilde Frang and Ning Feng Violin Duo Concert", "locationName": "National Concert Hall"},
    "69c2c3d626b3242a48a9ddcc": {"title": "2026 Banqiao Music Showcase: NTUA Rising Stars Concert", "locationName": "NTCH Recital Hall"},
    "68dd602626b324253c0d9f78": {"title": "Fusion of Water and Fire: 2026 Piano Recital by Lee Cho-yu", "locationName": "National Concert Hall"},
    "69c4156926b3242a48a9de2f": {"title": "2026 Kuandu Arts Festival Drama Summer Performance: Tao Bozhi", "locationName": "National Taipei University of the Arts Drama Theater"},
    "69667abd26b3243b1ca0bf24": {"title": "Liching 2026 Arts Feast: Orchestre Philharmonique de Radio France x Kantorow", "locationName": "National Concert Hall"},
    "69e50a9c26b3242a48a9e55c": {"title": "NTUA 2026 Spring-Summer Series: NTUA Choir Concert", "locationName": "National Taipei University of the Arts Concert Hall"},
    "69aefd6226b3242a48a9d939": {"title": "Ivanov Violin Recital", "locationName": "NTCH Recital Hall"},
    "69a1d06026b32454e437cb9c": {"title": "Yang's Ensemble Theater: I Am Not a Movie Queen", "locationName": "NTCH Experimental Theater"},
    "69b6e7d726b3242a48a9dbf0": {"title": "University of Taipei Sports Arts Department 2026 Graduation Show: Gap", "locationName": "University of Taipei Zhongzheng Hall"},
    "69d7db9226b3242a48a9e1c9": {"title": "Shattered Dreamscape", "locationName": "Taipei Philharmonic and Mather Music Cultural Hall"},
    "6939a7e726b32416dc348b81": {"title": "2026 Eslite Chamber Music Festival: Titans Trilogy", "locationName": "Eslite Performance Hall"},
    "69c6b86e26b3242a48a9dea9": {"title": "115th Year Dadaocheng Resident Troupe: Chen Shimei - Countering Treachery", "locationName": "Dadaocheng Theater"},
    "69baf33626b3242a48a9dc69": {"title": "2026 Masaaki Kishibe x Andy McKee Taiwan Concert", "locationName": "Riverside Live House Ximen Red House"},
    "69de732926b3242a48a9e2fd": {"title": "\"Ellie, My Love\" - Ellie", "locationName": "National Concert Hall"},
}


LOCATION_REPLACEMENTS = [
    ("臺北表演藝術中心", "Taipei Performing Arts Center"),
    ("台北表演藝術中心", "Taipei Performing Arts Center"),
    ("國家戲劇院", "National Theater"),
    ("國家音樂廳", "National Concert Hall"),
    ("藍盒子", "Blue Box"),
    ("球劇場", "Globe Playhouse"),
    ("大劇院", "Grand Theater"),
    ("太陽廳", "Sun Hall"),
    ("排練場", "Rehearsal Room"),
    ("臺北市", "Taipei City"),
    ("台北市", "Taipei City"),
]


def normalize_space(text: str) -> str:
    return " ".join(str(text or "").split()).strip()


def strip_html(text: str) -> str:
    return normalize_space(re.sub(r"<[^>]+>", " ", str(text or "")))


def localize_location(text: str) -> str:
    result = str(text or "")
    for zh, en in LOCATION_REPLACEMENTS:
        result = result.replace(zh, en)
    return normalize_space(result)


def extract_english_title_from_description(description: str) -> str:
    # Many source rows include an English title segment near the beginning.
    text = strip_html(description)[:1200]
    candidates = re.findall(r"[A-Za-z0-9][A-Za-z0-9 ,.'&:/()\-]{12,}", text)
    for candidate in candidates:
        c = normalize_space(candidate)
        lower = c.lower()
        if any(k in lower for k in ["opentix", "search", "service", "notice", "ticket", "program info"]):
            continue
        if len(c.split()) < 2:
            continue
        return c
    return ""


def extract_english_summary(description: str) -> str:
    text = strip_html(description)[:5000]
    # Pick first reasonably long English sentence.
    sentences = re.split(r"(?<=[.!?])\s+", text)
    for sentence in sentences:
        s = normalize_space(sentence)
        if len(s) < 24:
            continue
        ascii_ratio = sum(1 for ch in s if ord(ch) < 128) / max(len(s), 1)
        if ascii_ratio < 0.9:
            continue
        if len(s) > 140:
            s = s[:140].rstrip() + "…"
        return s
    return ""


_CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def needs_translation(text: str) -> bool:
    value = normalize_space(text)
    return bool(value and _CJK_RE.search(value))


def translate_map(texts: set[str]) -> dict[str, str]:
    if not texts:
        return {}
    translator = GoogleTranslator(source="zh-TW", target="en")
    pending = sorted(texts)
    result: dict[str, str] = {}
    batch_size = 40
    for i in range(0, len(pending), batch_size):
        batch = pending[i : i + batch_size]
        try:
            translated = translator.translate_batch(batch)
        except Exception:
            translated = None
        if not isinstance(translated, list) or len(translated) != len(batch):
            translated = []
            for item in batch:
                try:
                    translated.append(translator.translate(item))
                except Exception:
                    translated.append(item)
        for src, dst in zip(batch, translated):
            normalized_dst = normalize_space(str(dst or ""))
            result[src] = normalized_dst if normalized_dst else src
    return result


def main() -> None:
    rows = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    converted = []
    translated_titles = 0
    title_candidates: set[str] = set()
    location_candidates: set[str] = set()

    for row in rows:
        if not isinstance(row, dict):
            continue
        item = dict(row)
        uid = str(row.get("UID", ""))
        description = str(row.get("descriptionFilterHtml") or row.get("description") or "")
        zh_title = normalize_space(str(row.get("title", "")))
        manual = MANUAL_OVERRIDES.get(uid)
        if manual:
            item["title"] = manual["title"]
        inferred_title = extract_english_title_from_description(description)
        if inferred_title and not manual:
            item["title"] = inferred_title
            translated_titles += 1
        if needs_translation(item.get("title", "")):
            title_candidates.add(normalize_space(item.get("title", "")))

        show_info = row.get("showInfo")
        if isinstance(show_info, list) and show_info:
            new_show_info = []
            for s in show_info:
                if isinstance(s, dict):
                    s2 = dict(s)
                    if manual and manual.get("locationName"):
                        s2["locationName"] = manual["locationName"]
                    else:
                        s2["locationName"] = localize_location(str(s.get("locationName", "")))
                    s2["location"] = localize_location(str(s.get("location", "")))
                    if needs_translation(s2.get("locationName", "")):
                        location_candidates.add(normalize_space(s2.get("locationName", "")))
                    if needs_translation(s2.get("location", "")):
                        location_candidates.add(normalize_space(s2.get("location", "")))
                    new_show_info.append(s2)
                else:
                    new_show_info.append(s)
            item["showInfo"] = new_show_info

        # Keep aiSummary as-is for now; user requested to skip aiSummary translation.

        converted.append(item)

    title_map = translate_map(title_candidates)
    location_map = translate_map(location_candidates)
    translated_remaining_titles = 0
    translated_remaining_locations = 0
    for item in converted:
        title = normalize_space(item.get("title", ""))
        if title in title_map:
            next_title = title_map[title]
            if next_title != title:
                translated_remaining_titles += 1
            item["title"] = next_title
        show_info = item.get("showInfo")
        if isinstance(show_info, list):
            for s in show_info:
                if not isinstance(s, dict):
                    continue
                loc_name = normalize_space(s.get("locationName", ""))
                loc = normalize_space(s.get("location", ""))
                if loc_name in location_map:
                    next_loc_name = location_map[loc_name]
                    if next_loc_name != loc_name:
                        translated_remaining_locations += 1
                    s["locationName"] = next_loc_name
                if loc in location_map:
                    s["location"] = location_map[loc]

    TARGET_PATH.write_text(json.dumps(converted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"rows={len(converted)} translated_titles={translated_titles} "
        f"auto_titles={translated_remaining_titles} auto_locations={translated_remaining_locations}"
    )


if __name__ == "__main__":
    main()
