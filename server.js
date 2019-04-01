const express = require('express');
const app = express();
const io = require('socket.io')(80)
const NewsAPI = require('newsapi');
const newsapi = new NewsAPI('b4a11ebd8aef4f7793149badad58fc33');
const path = require('path');

let roomlist = {};
let GR = {};
io.on('connection', function(socket){
    socket.emit('games', roomlist);
    socket.on('getgames', () =>socket.emit('games', roomlist));
    socket.on('login', (s) =>{
        socket.username = s;
    });
    socket.on('disconnect', () =>{
        removeUser(socket.username)
    });
    //Get room
    socket.on('getRoom', () => {
        socket.emit('room',roomlist[socket.room])
    })
	//Join room
  	socket.on('joinroom', (room) => {

  		socket.join(room);
  		let roomstate = addToRoom(room, socket.username);
  		if(roomstate === false){
  		    socket.join();
  			socket.emit('failed', room);
  			return;
  		}
  		socket.emit('granted', room);
  		socket.room = room;
  		if(roomstate === 2){
  		    console.log('Room full',room);
  			prepareGame(room);
  			startGame(room)
  		}
        socket.emit('room',roomlist[socket.room])
        io.emit('games',roomlist);
  	});
	
	//Game handling
	socket.on('start',() => {
		prepareGame(socket.room);
		startGame(socket.room)
	})
	//Update points
	socket.on('updatepoint', () => {
	    GR[socket.room]['users'][socket.username]++;
	})
});

/**
	startGame() : creates a running game
	param {room}: string roomname

	returns void
**/
function startGame(room){
    io.to(room).emit('starting'); //Send til alle klienter i rommet "starting", spillet starter straks
    setTimeout(() => {	//Timeout, vent 3 sekunder
        io.to(room).emit('started', GR[room]);	//Send til klienter, spillet har startet
        let upd = setInterval(()=>{ //Vi lager en interval som oppdaterer klientene 5 ganger i sekundet
            //Bruker oppdateres om romstatus
            let copy = GR[room]	//VI lager en kopi av rom-objektet
            delete copy['article'] //Vi gjør det for å fjerne artikkelen fra objektet uten å fjerne fra original
            //Artikkel-objektet er unødvendig for brukeren å få oppdatert, derfor fjerner vi for å forminske hvor tung appen blir
            io.to(room).emit('update', copy)  // Oppdater alle klienter i rommet om spill-status
        },200)
        setTimeout(()=> { //Timeout, 60 sekunder, vi venter med å stoppe spillet i 60 sekunder
            io.to(room).emit('done', GR[room]) //Når spillet er ferdig forteller i klient
            clearInterval(upd) // Stopper oppdaterings-intervall
            setTimeout(()=> {
                gameFinished(room) //etter 10 sekunder fjerner vi rommet, slik at det ikke blir overflødig
            },10000)
        },60000)
    },3000)
}
async function getWords(){
    return new Promise((resolve, reject) => { 
        newsapi.v2.everything({
            sources: ['nrk','aftenposten'],
            pageSize:5,
            page: Math.random((Math.random()*10)/2)
        }).then(response => {
            let l = response.articles.map(article => {
                if(!article.description)return;
                let a = article['description'].replace("[^a-zA-Z0-9 .,]|(?<!\\d)[.,]|[.,](?!\\d)", "").split(" ");
                article.description = a;
            });
            resolve(response)
        })
    })
}
async function prepareGame(room) {
    if (GR[room]) return;
    GR[room] = {users:{}}
    roomlist[room]['users'].forEach(user => {
        GR[room]['users'][user] = 0
    });
    GR[room]['title'] = room
    getWords().then(res => {
        GR[room]["article"] = res;
        delete roomlist[room];
        return GR[room]["article"]
    })
}
function gameFinished(room){
    if(!GR[room]) return;
    delete GR[room]
}
function addToRoom(room, user){
	if(Object.keys(roomlist).includes(room)){
		if(roomlist[room]['users'].length > 4) return false;
		roomlist[room]['users'].push(user)
	}else{
		if(GR[room]){
			return false
		}
		roomlist[room] = {users:[]};
		roomlist[room]['users'] = [user]
	}
	return roomlist[room]['users'].length;
}
function removeUser(user){
    Object.keys(roomlist).forEach((room) =>{
        roomlist[room]['users'] = roomlist[room]['users'].filter(u => u !== user)
        if(!roomlist[room]['users'].length){
            delete roomlist[room]
        }
    })
}

app.use(express.static('build'));
app.get('/', function (req,res) {
    res.sendFile(path.join(__dirname,'/build/index.html'));
});
app.listen(8000);