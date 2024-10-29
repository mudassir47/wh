// index.js

const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');

// Initialize Express App
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const port = process.env.PORT || 3000;

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for user sessions
const sessions = {};

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true } // Set to false for debugging
});

// Handle Socket.io connections
io.on('connection', (socket) => {
    console.log('New client connected');

    // Emit QR code when it's received
    client.on('qr', (qr) => {
        console.log('QR RECEIVED');
        qrcode.toDataURL(qr, (err, url) => {
            if (err) {
                console.error('Error generating QR code', err);
                socket.emit('message', 'Failed to generate QR Code, please try again.');
                return;
            }
            socket.emit('qr', url); // Emit QR code to the frontend
            socket.emit('message', 'QR Code received, scan please!');
        });
    });

    // Emit ready status
    client.on('ready', () => {
        console.log('WhatsApp Client is ready!');
        socket.emit('ready');
        socket.emit('message', 'WhatsApp Client is ready!');
    });

    // Emit authenticated status
    client.on('authenticated', () => {
        console.log('WhatsApp Client authenticated!');
        socket.emit('authenticated');
    });

    // Emit auth failure
    client.on('auth_failure', (msg) => {
        console.error('AUTHENTICATION FAILURE', msg);
        socket.emit('auth_failure', msg);
    });

    // Emit disconnected status
    client.on('disconnected', (reason) => {
        console.log('WhatsApp Client disconnected:', reason);
        socket.emit('disconnected', reason);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });

    // Handle logout request from client
    socket.on('logout', () => {
        client.logout();
    });
});

// Listen for incoming messages
client.on('message', async msg => {
    try {
        const chat = await msg.getChat();
        const contact = await msg.getContact();
        const number = contact.number; // User's WhatsApp number

        // Initialize user session if not exists
        if (!sessions[number]) {
            sessions[number] = { stage: 'ask_name' };
        }

        const session = sessions[number];

        // Handle different stages
        switch (session.stage) {
            case 'ask_name':
                // Ask for the user's name
                msg.reply('Welcome to Pathological Services! Please enter your name:');
                session.stage = 'get_name';
                break;

            case 'get_name':
                session.name = msg.body.trim();
                msg.reply(`Hello, ${session.name}! Please select a service from the list below by sending the corresponding number:\n\n` +
                    `*Pathological Services*\n` +
                    `1) Hematology\n` +
                    `2) Biochemistry\n` +
                    `3) Serology & Immunology\n` +
                    `4) Microbiology\n` +
                    `5) Endocrinology & Hormones\n` +
                    `6) Infectious Diseases\n` +
                    `7) Molecular Diagnostics & Specialized Tests`);
                session.stage = 'select_service';
                break;

            case 'select_service':
                const serviceNumber = parseInt(msg.body.trim());
                const services = {
                    1: { name: 'Hematology', image: '1.png', description: `*Hematology*\n- Complete Blood Count (CBC)\n- Hemoglobin (Hb) Test\n- Platelet Count\n- ESR (Erythrocyte Sedimentation Rate)\n- Blood Grouping & Rh Factor\n- Prothrombin Time (PT)/INR` },
                    2: { name: 'Biochemistry', image: '2.png', description: `*Biochemistry*\n- Blood Glucose (Fasting, Postprandial, Random)\n- Lipid Profile (Total Cholesterol, HDL, LDL, Triglycerides)\n- Liver Function Test (LFT)\n- Kidney Function Test (KFT)\n- Serum Calcium & Phosphorus\n- HbA1c (Glycated Hemoglobin)\n- Iron Studies (Serum Iron, Ferritin, TIBC)` },
                    3: { name: 'Serology & Immunology', image: '3.png', description: `*Serology & Immunology*\n- Widal Test (Typhoid)\n- Dengue NS1 Antigen, IgG/IgM Antibodies\n- Malaria Antigen Test\n- HIV I & II Test\n- HBsAg (Hepatitis B)\n- HCV Test (Hepatitis C)\n- CRP (C-Reactive Protein)\n- Rheumatoid Factor (RA)\n- Anti-Nuclear Antibody (ANA)` },
                    4: { name: 'Microbiology', image: '4.png', description: `*Microbiology*\n- Routine Stool Examination\n- Urine Routine & Microscopy\n- Blood, Urine, and Sputum Culture/Sensitivity\n- TB-PCR (for Tuberculosis)\n- H. Pylori Antigen Test` },
                    5: { name: 'Endocrinology & Hormones', image: '5.png', description: `*Endocrinology & Hormones*\n- Thyroid Profile (T3, T4, TSH)\n- Vitamin D & Vitamin B12\n- Insulin Levels\n- FSH, LH, Prolactin, Estradiol\n- Testosterone` },
                    6: { name: 'Infectious Diseases', image: '6.png', description: `*Infectious Diseases*\n- Covid-19 RTPCR/Antigen Test\n- TORCH Panel (Toxoplasmosis, Rubella, Cytomegalovirus, Herpes)\n- VDRL (Syphilis)` },
                    7: { name: 'Molecular Diagnostics & Specialized Tests', image: '7.png', description: `*Molecular Diagnostics & Specialized Tests*\n- PCR for Viral Load (HIV, HBV, HCV)\n- DNA Tests (Paternity or Forensic Testing)\n- Genetic Screening` }
                };

                if (services[serviceNumber]) {
                    session.service = services[serviceNumber];
                    // Send image with description
                    const media = MessageMedia.fromFilePath(path.join(__dirname, 'public', session.service.image));
                    chat.sendMessage(media, { caption: session.service.description });

                    // Ask for location
                    msg.reply('Please share your location for the booking by clicking the attachment icon and selecting location.');
                    session.stage = 'get_location';
                } else {
                    msg.reply('Invalid selection. Please send a number between 1 and 7 corresponding to the service you want.');
                }
                break;

            case 'get_location':
                if (msg.type === 'location') {
                    const location = msg.location;
                    session.latitude = location.latitude;
                    session.longitude = location.longitude;
                    session.address = location.address || 'Not provided';
                    // React with thumbs-up emoji
                    await msg.react('👍');
                    // Ask for preferred time
                    msg.reply('Please provide your preferred time for the appointment (e.g., "2024-05-01 10:00 AM"):');
                    session.stage = 'get_time';
                } else {
                    msg.reply('Please share your location by clicking the attachment icon and selecting location.');
                }
                break;

            case 'get_time':
                session.time = msg.body.trim();
                // React with thumbs-up emoji
                await msg.react('👍');
                // Confirm booking
                msg.reply(`Please confirm your booking details:\n\n` +
                    `*Name*: ${session.name}\n` +
                    `*Service*: ${session.service.name}\n` +
                    `*Address*: ${session.address}\n` +
                    `*Preferred Time*: ${session.time}\n\n` +
                    `Please reply with 'Yes' to confirm or 'No' to cancel.`);
                session.stage = 'confirm_booking';
                break;

            case 'confirm_booking':
                const confirmation = msg.body.trim().toLowerCase();
                if (confirmation === 'yes') {
                    // Final confirmation
                    msg.reply(`Thank you, ${session.name}! Your appointment has been booked.\n\n` +
                        `*Booking Details:*\n` +
                        `Name: ${session.name}\n` +
                        `Service: ${session.service.name}\n` +
                        `Address: ${session.address}\n` +
                        `Preferred Time: ${session.time}\n\n` +
                        `We have received your booking and will confirm shortly.`);
                    // React with thumbs-up emoji
                    await msg.react('👍');
                    // Optionally, store booking details in a database here

                    // Reset session
                    sessions[number] = null;
                } else if (confirmation === 'no') {
                    msg.reply('Your booking has been canceled. If you wish to make a new booking, please start the process again.');
                    // React with thumbs-down emoji
                    await msg.react('👎');
                    // Reset session
                    sessions[number] = null;
                } else {
                    msg.reply("Invalid response. Please reply with 'Yes' to confirm or 'No' to cancel.");
                }
                break;

            default:
                msg.reply('Sorry, something went wrong. Please start over by sending any message.');
                sessions[number] = null;
                break;
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
});

// Start WhatsApp Client
client.initialize();

// Routes

// Home route to display QR code and status
app.get('/', (req, res) => {
    res.render('index');
});

// Logout route (optional if you want to handle via HTTP)
app.post('/logout', (req, res) => {
    client.logout();
    res.redirect('/');
});

// Start Express Server
server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
