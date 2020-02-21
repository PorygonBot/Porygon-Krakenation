//Importing all required libraries for Discord, Showdown, and Google
const fs = require("fs");
const express = require("express");
const ws = require("ws");
const path = require("path");
const opn = require("open");
const axios = require("axios");
const Discord = require("discord.js");
const getUrls = require("get-urls");
const { google } = require("googleapis");

//Constants required to make the program work as intended
const plus = google.plus("v1");
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
const { psUsername, psPassword, botToken, api_key } = require("./config.json");

const keyfile = path.join(__dirname, "client_secret.json");
const keys = JSON.parse(fs.readFileSync(keyfile));
const scopes = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    'https://www.googleapis.com/auth/spreadsheets',
];

// Create an oAuth2 client to authorize the API call
const client = new google.auth.OAuth2(
    keys.web.client_id,
    keys.web.client_secret,
    keys.web.redirect_uris[0]
);

// Generate the url that will be used for authorization
let authorizeUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: scopes
});

// Open an http server to accept the oauth callback. In this
// simple example, the only request to our webserver is to
// /oauth2callback?code=<code>
const app = express();
app.get("/oauth2", (req, res) => {
    const code = req.query.code;
    client.getToken(code, (err, tokens) => {
        if (err) {
            console.error("Error getting oAuth tokens:");
            throw err;
        }
        client.setCredentials(tokens);
        res.send("Authentication successful! Please return to the console.");
        server.close();
    });
});
client.setCredentials()

const server = app.listen(3000, () => {
    // open the browser to the authorize url to start the workflow
    console.log(authorizeUrl);
    opn(authorizeUrl, { wait: false });
});

const bot = new Discord.Client({ disableEveryone: true });

//When the bot is connected and logged in to Discord
bot.on("ready", async() => {
    console.log(`${bot.user.username} is online!`);
    bot.user.setActivity(`PS battles`, { type: "watching" });
});

//This is connection code to the PS server.
const websocket = new ws("ws://34.222.148.43:8000/showdown/websocket");
console.log("Server started!");

//When the server has connected
websocket.on("open", function open() {
    console.log("Server connected!");
});

//This is an array filled with all the data sent to me by the server since the bot has last been started
let dataArr = [];
let p1a = "";
let p2a = "";
let players = [];
let battlelink = "";
let pokes1 = [];
let pokes2 = [];
let killer = "";
let victim = "";
let killJson = {};
let deathJson = {};
let replay = ""; //TODO implement replay capabilities in the bot (this is possible)
let turns = 0;
//when the websocket sends a message
websocket.on("message", async function incoming(data) {
    let realdata = data.split("\n");

    //stuff to do after server connects
    if (data.startsWith("|challstr|")) {
        let nonce = data.substring(10);
        let assertion = await login(nonce);
        //logs in
        websocket.send(`|/trn iGLBot,128,${assertion}|`);
    }

    //removing the `-supereffective` line if it exists in realdata
    for (let element of realdata) {
        if (element.startsWith(`|-supereffective|`)) {
            realdata.splice(realdata.indexOf(element), 1);
        }
    }
    //going through each line in realdata
    for (let line of realdata) {
        dataArr.push(line);
        let linenew = line.substring(1);
        let parts = linenew.split("|");

        if (linenew.startsWith(`battle`)) { //TODO fix battlelink thing
            outBattlelink = line;
            //console.log(linenew);
        }

        else if (linenew.startsWith(`turn`)) {
            turns++;
        }

        else if (linenew.startsWith(`switch`)) {
            if (linenew.includes("p1a")) p1a = parts[2].split(",")[0];
            else if (linenew.includes("p2a")) p2a = parts[2].split(",")[0];
        }

        //|player|p2|infernapeisawesome|1|
        else if (linenew.startsWith(`player`)) {
            players.push(parts[2]);
            console.log("Players: " + players);
        }

        //|poke|p1|Hatterene, F|
        else if (linenew.startsWith(`poke`)) {
            let pokemon = parts[2].split(",")[0];
            if (parts[1] === "p1") pokes1.push(pokemon);
            else if (parts[1] === "p2") pokes2.push(pokemon);

            killJson[pokemon] = 0;
            deathJson[pokemon] = 0;
        } else if (linenew.startsWith("faint")) {
            if (parts[1].substring(0, 3) === "p1a") {
                killer = p2a;
                victim = p1a;
            } 
            else {
                killer = p1a;
                victim = p2a;
            }
            
            //makes sure megas count for the same number of kills/deaths
            if (killer.endsWith(`-Mega`)) {
                
                console.log("killJson before: ", killJson);
                if (!killJson[killer]) {
                    killJson[killer] = killJson[killer.split("-")[0]];
                    delete killJson[killer.split("-")[0]];
                }
                console.log("killJson after: ", killJson);
            }
            if (victim.endsWith(`-Mega`)){
                console.log("deathJson before:", deathJson);
                if (!killJson[killer]) {
                    killJson[killer] = killJson[killer.split("-")[0]];
                    delete killJson[killer.split("-")[0]];
                }
                console.log("deathJson after:", deathJson);
            }

            console.log(`${killer} killed ${victim}`);
            //updating killer info in the JSON
            if (!killJson[killer])
                killJson[killer] = 1;
            else
                killJson[killer]++;
            //updating victim info in the JSON
            if (!deathJson[victim])
                deathJson[victim] = 1;
            else
                deathJson[victim]++;
        }

        //|win|infernapeisawesome
        else if (linenew.startsWith(`win`)) {
            let winner = parts[1];
            console.log(`${winner} won!`);
            console.log(`THIS IS THE BATTLELINK: ${battlelink}`);
            websocket.send(`/leave ${battlelink}`);
            let loser = ((winner === players[players.length - 2]) ? players[players.length - 1] : players[players.length - 2]);
            console.log(`${loser} lost!`);

            //updating the google sheet accordingly
            let spreadsheetId = "1YU_lM_mBRuwa2NGk6tgSrWG1S70Stvd_7kThH7X-ATc";
            let tableName = "BattleInput";

            //creating requests to update spreadsheet with new info
            let request = {
                "spreadsheetId": spreadsheetId,
                "range": `${tableName}!A2:AO2`,
                "includeValuesInResponse": false,
                "responseValueRenderOption": "FORMATTED_VALUE",
                "valueInputOption": "USER_ENTERED",
                "resource": {
                    "range": `${tableName}!A2:AO2`,
                    "values": [
                        [players[0], players[1], winner, replay,
                        pokes1[0], killJson[pokes1[0]], deathJson[pokes1[0]],
                        pokes1[1], killJson[pokes1[1]], deathJson[pokes1[1]],
                        pokes1[2], killJson[pokes1[2]], deathJson[pokes1[2]],
                        pokes1[3], killJson[pokes1[3]], deathJson[pokes1[3]],
                        pokes1[4], killJson[pokes1[4]], deathJson[pokes1[4]],
                        pokes1[5], killJson[pokes1[5]], deathJson[pokes1[5]],
                        pokes2[0], killJson[pokes2[0]], deathJson[pokes2[0]],
                        pokes2[1], killJson[pokes2[1]], deathJson[pokes2[1]],
                        pokes2[2], killJson[pokes2[2]], deathJson[pokes2[2]],
                        pokes2[3], killJson[pokes2[3]], deathJson[pokes2[3]],
                        pokes2[4], killJson[pokes2[4]], deathJson[pokes2[4]],
                        pokes2[5], killJson[pokes2[5]], deathJson[pokes2[5]],
                        turns
                        ]
                    ]
                },
                "auth": client
            };

            //updating pokemon info
            let placholder1 = await addPokemonInfo(request);
            console.log("request update: ", placholder1);

            //resetting after every game
            dataArr = [];
            p1a = "";
            p2a = "";
            players = [];
            battlelink = "";
            pokes1 = [];
            pokes2 = [];
            killer = "";
            victim = "";
            killJson = {};
            deathJson = {};
            replay = "";
            turns = 0;
        }
    }
});

//When a message gets sent on Discord in the channel
bot.on("message", async message => {
    let channel = message.channel;

    if (message.author.bot) return;

    let msgStr = message.content;
    let prefix = "porygon, use"

    if (channel.type === "dm") return;
    else if (
        channel.id === "650535162073055303"
    ) {
        //separates given message into its parts
        let urls = Array.from(getUrls(msgStr)); //This is because getUrls returns a Set
        let battleLink = urls[0]; //http://sports.psim.us/battle-gen8legacynationaldex-17597 format

        //joins the battle linked
        if (battleLink) {
            channel.send(`Joining the battle...`);
            websocket.send(`|/join ${battleLink.substring(22)}`);
            channel.send(`Battle joined! Keeping track of the stats now.`);
            websocket.send(
                `${battleLink.substring(22)}|Battle joined! Keeping track of the stats now.`
            );
        }
    }

    //checks for help command
    if (msgStr.toLowerCase() === `${prefix} help`) {
        let bicon = bot.user.displayAvatarURL; 
        let helpEmbed = new Discord.RichEmbed()
        .setTitle("Porygon Help")
        .setThumbnail(bicon)
        .setColor(0xffc0cb)
        .addField("Prefix", "Porygon, use ___")
        .addField("What does Porygon do? ", "It joins a Pokemon Showdown battle when the live battle link is sent to a dedicated channel and keeps track of the deaths/kills in the battle, updating a Stats Sheet at the end.")
        .addField("How do I use Porygon?", `Make a dedicated live-battle-links channel, let @harbar20#9389 know about all the detail he asks you, and that's it!`)
        .addField("Source", "https://github.com/harbar20/Porygon")
        .setFooter("Made by @harbar20#9389", `https://pm1.narvii.com/6568/c5817e2a693de0f2f3df4d47b0395be12c45edce_hq.jpg`);

        return channel.send(helpEmbed);
    }
});
//making the bot login
bot.login(botToken);

async function login(nonce) {
    let psUrl = "https://play.pokemonshowdown.com/action.php";
    let data = {
        act: "login",
        name: psUsername,
        pass: psPassword,
        challstr: nonce
    };

    let response = await axios.post(psUrl, data);
    let json = JSON.parse(response.data.substring(1));
    console.log("Logged in to PS.");
    return json.assertion;
}

//Sheets
const sheets = google.sheets({
    version: 'v4',
    auth: api_key
});
async function addPokemonInfo(request) {
    let placeholder = await new Promise((resolve, reject) => {
        sheets.spreadsheets.values.append(request, function(err, response) {
            if (err) {
                reject(err)
            } else {
                resolve(response)
            }
        });
    });

    return placeholder;
}
