// Define the shape of a single Trivia Question
export interface TriviaQuestion {
  question: string;
  answers: [string, string, string, string]; // A tuple ensures exactly 4 answers
  correctAnswerIndex: number; // Store the index (0-3) of the correct answer
}

// The class that manages your question database
export class QuestionDatabase {
private static questions: TriviaQuestion[] = [
  {
    question: "Area 51 is located in which US state?",
    answers: ["Florida", "California", "Nevada", "Texas"],
    correctAnswerIndex: 3,
  },
  {
    question: "What is the capital city of Australia?",
    answers: ["Adelaide", "Sydney", "Melbourne", "Canberra"],
    correctAnswerIndex: 4,
  },
  {
    question: "Who wrote the play Romeo and Juliet?",
    answers: ["Jane Austen", "William Shakespeare", "Stephen King", "Charles Dickens"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the largest planet in our solar system?",
    answers: ["Jupiter", "Mercury", "Earth", "Uranus"],
    correctAnswerIndex: 1,
  },
  {
    question: "In which year did World War II end?",
    answers: ["1944", "1925", "1945", "1947"],
    correctAnswerIndex: 3,
  },
  {
    question: "What is the chemical symbol for gold?",
    answers: ["Gl", "Au", "Gd", "Ad"],
    correctAnswerIndex: 2,
  },
  {
    question: "Which ocean is the deepest in the world?",
    answers: ["Pacific Ocean", "Indian Ocean", "Arctic Ocean", "Atlantic Ocean"],
    correctAnswerIndex: 1,
  },
  {
    question: "Who painted the Mona Lisa?",
    answers: ["Leonardo DiCaprio", "Leonardo da Vinci", "Leonardo Hamato", "Michelangelo"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the smallest prime number?",
    answers: ["1", "2", "7", "9"],
    correctAnswerIndex: 2,
  },
  {
    question: "Which country is known as the Land of the Rising Sun?",
    answers: ["China", "Japan", "France ", "England"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the hardest natural substance on Earth?",
    answers: ["Diamond", "Obsidian", "Cubic boron nitride", "Carbyne"],
    correctAnswerIndex: 1,
  },
  {
    question: "Who developed the theory of relativity?",
    answers: ["Albert Einstein", "Marie Curie", "Niels Bohr", "Max Planck"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which continent is the Sahara Desert located on?",
    answers: ["North America", "Africa", "Europe", "Asia"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the longest river in the world?",
    answers: ["Yangtze", "Nene", "Amazon", "Nile"],
    correctAnswerIndex: 3,
  },
  {
    question: "Which language has the most native speakers worldwide?",
    answers: ["English", "French", "Spanish", "Mandarin Chinese"],
    correctAnswerIndex: 3,
  },
  {
    question: "What is the currency of Canada?",
    answers: ["Pound", "US Dollar", "French Canadian Dollar", "Canadian Dollar"],
    correctAnswerIndex: 3,
  },
  {
    question: "Who was the first person to walk on the Moon?",
    answers: ["Michael jackson", "Neil Armstrong", "Buzz Aldrin", " Michael Collins"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the main ingredient in guacamole?",
    answers: ["Mashed Peas", "Kale", "Avocado", "Garlic"],
    correctAnswerIndex: 3,
  },
  {
    question: "Which organ in the human body pumps blood?",
    answers: ["Heart", "Lungs", "Brain", "Kidney"],
    correctAnswerIndex: 1,
  },
  {
    question: "What is the tallest mountain in the world?",
    answers: ["Mount Everest", "K2", "Mount Fuji", "Mount Kilimanjaro"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which planet is known as the Red Planet?",
    answers: ["Venus", "Jupiter", "Mercury", "Mars"],
    correctAnswerIndex: 4,
  },
  {
    question: "Who discovered penicillin?",
    answers: ["Vincenzo Tiberio", "Alexander Fleming", "Marie Curie ", "Rosalind Franklin"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the square root of 144?",
    answers: ["14", "12", "16", "11"],
    correctAnswerIndex: 2,
  },
  {
    question: "Which country hosted the 2016 Summer Olympics?",
    answers: ["England", "South Korea", "The United States", "Rio de Janeiro"],
    correctAnswerIndex: 4,
  },
  {
    question: "What is the freezing point of water in Celsius?",
    answers: ["-1°C", "0°C", "1°C", "-3°C"],
    correctAnswerIndex: 2,
  },
  {
    question: "Which gas do plants absorb from the atmosphere?",
    answers: ["Carbon monoxide", "Carbon dioxide", "Oxygen", "Heilium"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the largest mammal in the world?",
    answers: ["Afriican Elephant", "Killer Whale", "Blue whale", "Hippopotamus "],
    correctAnswerIndex: 3,
  },
  {
    question: "Who wrote Harry Potter?",
    answers: ["Octavia E. Butler", "J. K. Rowling", "Margaret Atwood", "Robert Galbraith"],
    correctAnswerIndex: 2,
  },
  {
    question: "Which country gifted the Statue of Liberty to the United States?",
    answers: ["Belgium", "England", "Holland", "France"],
    correctAnswerIndex: 4,
  },
  {
    question: "What is the capital of Brazil?",
    answers: ["Buenos Aires", "Brasília", "Brazil", "Salvador"],
    correctAnswerIndex: 2,
  },
  {
    question: "How many sides does a hexagon have?",
    answers: ["8", "12", "4", "6"],
    correctAnswerIndex: 4,
  },
  {
    question: "Which instrument has 88 keys?",
    answers: ["Keyboard", "Organ", "Standard Piano", "Accordian"],
    correctAnswerIndex: 3,
  },
  {
    question: "What is the fastest land animal?",
    answers: ["Zebra", "Cheetah", "Pronghorn", "Gazelle"],
    correctAnswerIndex: 2,
  },
  {
    question: "Which blood type is known as the universal donor?",
    answers: ["O positive", "O negative", "A negative", "A positive"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the national sport of Japan?",
    answers: ["Sumo wrestling", "Baseball", "Judo", "Golf"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which element has the atomic number 1?",
    answers: ["Oxygen", "Hydrogen", "Lithium", "Helium"],
    correctAnswerIndex: 2,
  },
  {
    question: "Who was the first President of the United States?",
    answers: ["John Adams", "John Quincy Adams", "Thomas Jefferson", "George Washington"],
    correctAnswerIndex: 4,
  },
  {
    question: "What is the largest rainforest in the world?",
    answers: ["Congo", "Borneo", "Amazon", "New Guinea "],
    correctAnswerIndex: 3,
  },
  {
    question: "Which planet has the most moons?",
    answers: ["Uranus", "Saturn", "Venus", "Pluto"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the boiling point of water in Celsius?",
    answers: ["100°C", "67°C", "120°C", "83°C"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which country is famous for the pyramids of Giza?",
    answers: ["Peru", "Sudan", "Egypt", "Mexico"],
    correctAnswerIndex: 3,
  },
  {
    question: "Who composed the Four Seasons?",
    answers: ["Ludwig van Beethoven", "Antonio Vivaldi", "Edvard Grieg", "Wolfgang Amadeus Mozart"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the largest internal organ in the human body?",
    answers: ["Liver", "Heart", "Stomach", "Spleen"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which bird is often associated with delivering babies in folklore?",
    answers: ["Heron", "Emu", "Stork", "Ostrich"],
    correctAnswerIndex: 3,
  },
  {
    question: "What is the capital of South Korea?",
    answers: ["Sejong", "Seoul", "Ulsan", "Busan"],
    correctAnswerIndex: 2,
  },
  {
    question: "Which metal is liquid at room temperature?",
    answers: ["Gallium", "Caesium", "Mercury", "Rubidium"],
    correctAnswerIndex: 3,
  },
  {
    question: "What is the name of the fairy in Peter Pan?",
    answers: ["Puck", "Wanda", "Tinker Bell", "Flora"],
    correctAnswerIndex: 3,
  },
  {
    question: "Which country invented paper?",
    answers: ["England", "Wales", "France", "China"],
    correctAnswerIndex: 4,
  },
  {
    question: "What is the main language spoken in Argentina?",
    answers: ["Spanish", "French", "English", "Italian"],
    correctAnswerIndex: 1,
  },
  {
    question: "How many players are there in a standard soccer team on the field?",
    answers: ["12", "11", "9", "14"],
    correctAnswerIndex: 2,
  },
  {
    question: "Which vitamin is mainly produced when the skin is exposed to sunlight?",
    answers: ["Vitamin B12", "Vitamin C", "Vitamin D", "Vitamin A"],
    correctAnswerIndex: 3,
  },
{
    question: "Only 9% of US Households owned a television in",
    answers: ["1950", "1965", "1913", "1969"],
    correctAnswerIndex: 1,
  },
  {
    question: "What is the Portuguese word for \"Brazil\"?",
    answers: ["Brasil", "Brazil", "Brasilia", "Brasíl"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which church's interior in Vatican City was designed in 1503 by renaissance architects including Bramante, Michelangelo and Bernini?",
    answers: ["Catania Cathedral", "St. Mark’s Basilica", "St. Peter's Basilica", "The Duomo of Florence"],
    correctAnswerIndex: 3,
  },
  {
    question: "Which mountain has the highest peak in Australia?",
    answers: ["Mount Ossa, Tasmania", "Mount Kosciuszko, New South Wales", "Mount Bartle Frere, Queensland", "Mount Zeil, Northern Territory"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the name of the antagonist group in Danganronpa Another Episode: Ultra Despair Girls?",
    answers: ["The Monokubs", "Warriors of Hope", "Warriors of Despair", "The Ultimate Despair"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the romanized Korean word for \"heart\"?",
    answers: ["Aejeong", "Simjang", "Jeongsin", "Segseu"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the name of the extra pedal on a manual or standard transmission car?",
    answers: ["Clutch", "Shifter", "Booster", "Parking Brake"],
    correctAnswerIndex: 1,
  },
  {
    question: "Earl Grey tea is black tea flavoured with what?",
    answers: ["Bergamot oil", "Lavender", "Vanilla", "Honey"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which American-owned brewery led the country in sales by volume in 2015?",
    answers: ["Anheuser Busch", "Boston Beer Company", "Miller Coors", "D. G. Yuengling and Son, Inc"],
    correctAnswerIndex: 4,
  },
  {
    question: "Who is a co-founder of music streaming service Spotify?",
    answers: ["Daniel Ek", "Sean Parker", "Felix Miller", "Michael Breidenbruecker"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which country drives on the left side of the road?",
    answers: ["Japan", "Germany", "Russia", "China"],
    correctAnswerIndex: 1,
  },
  {
    question: "In \"Katamari Damacy\", you control a character known as:",
    answers: ["The Prince", "Fujio", "Ichigo", "Foomin"],
    correctAnswerIndex: 1,
  },
  {
    question: "Why is the night sky dark?",
    answers: ["Dust clouds absorb light", "The universe is finite in age and size", "Redshift doesn't let us see distant stars", "Quantum mechanics"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the last letter of the Greek alphabet?",
    answers: ["Mu", "Omega", "Epsilon", "Kappa"],
    correctAnswerIndex: 2,
  },
  {
    question: "What Latin phrase roughly translates to \"seize the day\"?",
    answers: ["Carpe diem", "Memento mori", "Plus ultra", "Sic semper tyrannis"],
    correctAnswerIndex: 1,
  },
  {
    question: "What is the profession of Elon Musk's mom, Maye Musk?",
    answers: ["Professor", "Model", "Biologist", "Musician"],
    correctAnswerIndex: 2,
  },
  {
    question: "The Swedish word \"Grunka\" means what in English?",
    answers: ["People", "Place", "Pineapple", "Thing"],
    correctAnswerIndex: 4,
  },
  {
    question: "Which of these anatomical terms refers to the tail end of the creature?",
    answers: ["Ventral", "Caudal", "Proximal", "Coronal"],
    correctAnswerIndex: 2,
  },
  {
    question: "In 2013 how much money was lost by Nigerian scams?",
    answers: ["$95 Million", "$956 Million", "$2.7 Billion", "$12.7 Billion"],
    correctAnswerIndex: 4,
  },
  {
    question: "What planet is not named after a Greek or Roman god?",
    answers: ["Jupiter", "Mars", "Earth", "Mercury"],
    correctAnswerIndex: 3,
  },
  {
    question: "What was Bank of America originally established as?",
    answers: ["Bank of Italy", "Bank of Long Island", "Bank of Pennsylvania", "Bank of Charlotte"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which product did Nokia, the telecommunications company, originally sell?",
    answers: ["Phones", "Paper", "Computers", "Processors"],
    correctAnswerIndex: 2,
  },
  {
    question: "A statue of Charles Darwin sits in what London museum?",
    answers: ["Tate", "British Museum", "Science Museum", "Natural History Museum"],
    correctAnswerIndex: 4,
  },
  {
    question: "What is the name of the currency used in Ethiopia?",
    answers: ["Dirham", "U.S. Dollar", "Birr", "Rand"],
    correctAnswerIndex: 3,
  },
  {
    question: "What is the defining characteristic of someone who is described as hirsute?",
    answers: ["Rude", "Funny", "Hairy", "Tall"],
    correctAnswerIndex: 3,
  },
  {
    question: "\"Gum arabic\" is a natural gum consisting of the hardened sap of which tree species?",
    answers: ["Palm", "Acacia", "Ficus", "Eucalyptus"],
    correctAnswerIndex: 2,
  },
  {
    question: "If someone said \"you are olid\", what would they mean?",
    answers: ["You are out of shape/weak.", "You smell extremely unpleasant.", "Your appearance is repulsive.", "You are incomprehensible/an idiot."],
    correctAnswerIndex: 2,
  },
  {
    question: "What is the highest number of Michelin stars a restaurant can receive?",
    answers: ["Four", "Five", "Three", "Six"],
    correctAnswerIndex: 3,
  },
  {
    question: "What is the shortest month of the year?",
    answers: ["February", "December", "April", "September"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which of the following languages does NOT use gender as a part of its grammar?",
    answers: ["Turkish", "German", "Danish", "Polish"],
    correctAnswerIndex: 1,
  },
  {
    question: "Amsterdam Centraal station is twinned with what station?",
    answers: ["Frankfurt (Main) Hauptbahnhof", "Paris Gare du Nord", "Brussels Midi", "London Liverpool Street"],
    correctAnswerIndex: 4,
  },
  {
    question: "In which fast food chain can you order a Jamocha Shake?",
    answers: ["Arby's", "McDonald's", "Burger King", "Wendy's"],
    correctAnswerIndex: 1,
  },
  {
    question: "What was the first ever London Underground line to be built?",
    answers: ["Circle Line", "Bakerloo Line", "Metropolitan Line", "Victoria Line"],
    correctAnswerIndex: 3,
  },
  {
    question: "Xanthophobia is the fear of what color?",
    answers: ["Blue", "Red", "Yellow", "Green"],
    correctAnswerIndex: 3,
  },
  {
    question: "Bob and Mike Bryan were well known brothers in which sport?",
    answers: ["Basketball", "Football", "Tennis", "Baseball"],
    correctAnswerIndex: 3,
  },
  {
    question: "Which restaurant's mascot is a clown?",
    answers: ["McDonald's", "Whataburger", "Burger King", "Sonic"],
    correctAnswerIndex: 1,
  },
  {
    question: "Which of these cities does NOT have a United States Minting location?",
    answers: ["San Fransisco, CA", "Philidelphia, PA", "West Point, NY", "St. Louis, MO"],
    correctAnswerIndex: 4,
  },
  {
    question: "According to the BBPA, what is the most common pub name in the UK?",
    answers: ["Red Lion", "Royal Oak", "White Hart", "King's Head"],
    correctAnswerIndex: 1,
  },
  {
    question: "Foie gras is a French delicacy typically made from what part of a duck or goose?",
    answers: ["Heart", "Stomach", "Intestines", "Liver"],
    correctAnswerIndex: 4,
  },
  {
    question: "What does the \"G\" mean in \"G-Man\"?",
    answers: ["Government", "Going", "Ghost", "Geronimo"],
    correctAnswerIndex: 1,
  },
  {
    question: "The architect known as Le Corbusier was an important figure in what style of architecture?",
    answers: ["Neoclassical", "Baroque", "Modernism", "Gothic Revival"],
    correctAnswerIndex: 3,
  },
  {
    question: "What does the Latin phrase \"Veni, vidi, vici\" translate into English?",
    answers: ["See no evil, hear no evil, speak no evil", "Life, liberty, and happiness", "I came, I saw, I conquered", "Past, present, and future"],
    correctAnswerIndex: 3,
  },
  {
    question: "When was Nintendo founded?",
    answers: ["October 19th, 1891", "September 23rd, 1889", "March 4th, 1887", "December 27th, 1894"],
    correctAnswerIndex: 2,
  },
  {
    question: "Where in La Coruña (Spain) is the headquarters of \"Inditex\", the biggest fashion group in the world?",
    answers: ["Arteijo", "Sanjenjo", "Mugía", "Órdenes"],
    correctAnswerIndex: 1,
  },
  {
    question: "What country does sushi & karaoke come from?",
    answers: ["Japan", "China", "South Korea", "Vietnam"],
    correctAnswerIndex: 1,
  },
  {
    question: "What type of animal was Harambe, who was shot after a child fell into it's enclosure at the Cincinnati Zoo?",
    answers: ["Tiger", "Gorilla", "Panda", "Crocodile"],
    correctAnswerIndex: 2,
  },
  {
    question: "Which mountain has the highest peak in North America?",
    answers: ["Mount Saint Elias, US/Canada border", "Mount Logan, Canada", "Denali, USA", "Pico de Orizaba, Mexico"],
    correctAnswerIndex: 3,
  },
  {
    question: "What year was the RoboSapien toy robot released?",
    answers: ["2004", "2000", "2001", "2006"],
    correctAnswerIndex: 1,
  },
  {
    question: "What does VR stand for?",
    answers: ["Very Real", "Virtual Reality", "Visual Recognition", "Voice Recognition"],
    correctAnswerIndex: 2,
  },
  {
    question: "What is on display in the Madame Tussaud's museum in London?",
    answers: ["Wax sculptures", "Designer clothing", "Unreleased film reels", "Vintage cars"],
    correctAnswerIndex: 1,
  },
];

  // Get all questions
  public static getAll(): TriviaQuestion[] {
    return this.questions;
  }

  // Get a random question (great for trivia games!)
  public static getRandom(): TriviaQuestion {
    const randomIndex = Math.floor(Math.random() * this.questions.length);
    return this.questions[randomIndex];
  }

  // Get a specific question by index
  public static getByIndex(index: number): TriviaQuestion | undefined {
    return this.questions[index];
  }
}