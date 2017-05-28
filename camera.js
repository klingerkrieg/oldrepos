/**
 * Autores:Alan Klinger klingerkrieg@gmail.com
 * 		   Lucas Dantas lucashiagod@gmail.com
 * Plugin do node-red
 */
var hostsConfig;
var portsToScan;
var networksToNmap;
var urlToServer;
var portForStream = 1337;

module.exports = function(RED) {
    function CameraNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;

		//console.log(config);
		//console.log(this);
		
		//Carrega as configuuracoes
		portsToScan = config.searchPorts;
		if (portsToScan == undefined || portsToScan == ""){
			portsToScan = '80,8080,8081';
		}
		networksToNmap = config.networksToNmap;
		
		hostsConfig = config.hosts.split("\n");
		var nmapConfig = config.nmap;
		
        this.on('input', function(msg) {

			//Salva o log
			/*var fs = require('fs');
			var util = require('util');
			var log_file = fs.createWriteStream('teste.log', {flags : 'w'});
			var log_stdout = process.stdout;
			console.log = function(d) { //
				log_file.write(util.format(d) + '\n');
				log_stdout.write(util.format(d) + '\n');
			};*/

			urlToServer = msg.req.headers.host.split(":")[0];
			
			paths = ['/video','/image/jpeg.cgi','/mjpeg',"/live.jpeg"];
			//caso o usuario opte por usar o nmap
			if (nmapConfig){
				scan(portsToScan,paths,node,msg);
			} else {
				getStream([],node,msg);
			}
			
			
        });
    }
    RED.nodes.registerType("camera",CameraNode);
}

/**
 * Mescla os hosts encontrados com os que estão configurados
 */
function hostsConfigToHosts(hostConfig,hosts){
	//separa um endereço compelto em partes dentro de um json
	//http://192.168.0.2:80/video
	
	for (var i = 0; i < hostConfig.length; i++){
		//se nao houver nenhuma url configurada
		if (hostConfig[i] == ""){
			continue;
		}
		parts = hostConfig[i].split("://")
		protocol = parts[0];
		
		if (parts[1].indexOf("/") == -1){
			host = parts[1];
			urlPath = "";
		} else {
			host = parts[1].substr(0,parts[1].indexOf("/"))
			urlPath = parts[1].substr(parts[1].indexOf("/"))
		}
		
		host = host.split(":")
		if (host.length > 1){//se houver porta
			port = host[1];
			host = host[0];
		} else {
			port = 80;//caso seja porta padrao
			host = host[0];
		}
		
		hosts.push({ip:host,
					port:port,
					path:urlPath,
					type:null,
					protocol:protocol});
	}
	return hosts;
}

/**
 * Inicia o stream de videos
 */
function getStream(hosts,node,msg){
	hosts = hostsConfigToHosts(hostsConfig,hosts);
	
	//hosts = [{ip:'192.168.0.14',port:'8080'},{ip:'192.168.0.12',port:'8081'},{ip:'192.168.0.23',port:'8080'}];
	//hosts = [{ip:'192.168.0.14',port:'80'}]
	//hosts
	/*hosts = [{ip:'192.168.0.11',
			port:8080,
			path:"/mjpeg",
			type:"mjpeg",
			protocol:"http"}]*/

	console.log("Hosts encontrados...");
	console.log(hosts);
	
	var request = require('request');
	var http = require('http');
	
	//vai salvar o server no context
	var globalContext = node.context().global;

	//caso ja tenha algum server aberto ele fecha
	if (globalContext.get("server") != undefined){
		globalContext.get("server").shutdown(function() {
			console.log('Reset server '+portForStream);
		});
	}
	
	//abre um novo server
	server = http.createServer(function (req, resp) {
		
		for (var i = 0; i < hosts.length; i++){
			host = hosts[i];
			
			url = host.protocol+"://"+host.ip+":"+host.port+host.path// +"?t="+ new Date().getTime();
			//Removo os parametros, para poder refazer a requisicao de imagens
			//Para cameras que nao trabalham com stream
			//console.log("req:"+ req.url +" - host:"+ '/'+host.ip.replace(/\./g, '_'));
			reqUrl = req.url.split("?");
			reqUrl = reqUrl[0];
			if (reqUrl === '/'+host.ip.replace(/\./g, '_')) {
				
				console.log(url);
				var x = request(url);
				//Se tivesse como conseguir o cabecalho aqui seria ideal
				//Mas o request nao retorna o cabecalho completo
				req.pipe(x);
				x.pipe(resp);
			}
		}
	});

	server = require('http-shutdown')(server);
	//escuta a porta
	server.listen(portForStream);
	//guarda no context
	globalContext.set("server",server);
	console.log('listen '+portForStream);
	

	html = '<style>.video{ width:320px;height:320px;border:1px solid;margin:5px; }</style>';
	for (var i = 0; i < hosts.length; i++){
		host = hosts[i];
		//Videos que foram definidos na configuracao nao sao testados
		//Todos esses serao do tipo update, melhorar isso depois porque posso ter um que nao necessite ser update
		if (host.type == 'jpeg' || host.type == null){
			autoUpdate = 'video update';
		} else {
			autoUpdate = 'video';
		}
		//quando é via plugin do vlc
		if (host.type == 'mpegurl' || host.protocol == 'rtsp'){
			html += '<embed class='+autoUpdate+' type="application/x-vlc-plugin" pluginspage="http://www.videolan.org" autoplay="yes" loop="no" width="300" height="200" target="http://'+urlToServer+':'+portForStream+'/'+host.ip.replace(/\./g, '_')+'" />'
				 +'<object classid="clsid:9BE31822-FDAD-461B-AD51-BE1D1C159921" codebase="http://download.videolan.org/pub/videolan/vlc/last/win32/axvlc.cab" style="display:none;"></object>';
		} else {
			//quando é streaming com png
			html += '<img class="'+autoUpdate+'" src="http://'+urlToServer+':'+portForStream+'/'+host.ip.replace(/\./g, '_')+'">';
		}
		
	}

	html += "<script>function updateImage() {imgs = document.getElementsByClassName('update');for (var _i = 0; _i < imgs.length; _i++){imgs[_i].src = imgs[_i].src.split('?')[0] + '?t='+ new Date().getTime();console.log(imgs[_i].src);}} setInterval(updateImage, 1000);</script>";
	
	msg.payload = html;
	node.send(msg);
	
	
}

/**
 * Verifica para cada host se ele possui alguma url com video
 */
function filtrarVideos(hosts,paths,node,msg){
	
	var hosts_filtrados = [];
	
	var completes = 0;
	var httpTest = require('http');
	for (var i = 0; i < hosts.length; i++){
		host = hosts[i];
		
		for (var y = 0; y < paths.length; y++){
		
			var options = {
			host: host.ip,
			port: host.port,
			path: paths[y],
			timeout: 1000
			};

			httpTest.get(options, function(resp){
				console.log("Test:"+resp.req._headers.host+resp.req.path+" - "+resp.statusCode);
				
				if (resp.statusCode == 200){
					console.log(resp.headers);
					host_part = resp.req._headers.host.split(":");
					if (host_part[1] == undefined){//quando é na porta 80 ele nao coloca porta nenhuma
						host_part[1] = 80;
					}
					if (hostExistsIn(host_part[0],hosts_filtrados) == false){
						
						hosts_filtrados.push({ip:host_part[0],
											  port:host_part[1],
											  path:resp.req.path,
											  type:resp.headers['content-type'].split('/')[1],
											  protocol:"http"});
					}
					
				}
				completes++;
				this.abort();
				
			}).on("error", function(e,resp){
				completes++;
				console.log("Got error: " + e.message);
			});
		}
	}
	
	
	var interval = setInterval(function(){
		console.log("Testando videos...");
		if (completes == (hosts.length * paths.length)){
			clearInterval(interval);
			console.log("iniciando stream");
			//só começa a realizar o stream quando testar todos os hosts
			getStream(hosts_filtrados,node,msg);
		}
	}, 500);
	
	
}





/**
 * Procura hosts na rede com o nmap
 */
function scan(portas,paths,node,msg){
	var nmap = require('node-nmap');
	
	var hosts = [];
	var ips = "";

	
	if (networksToNmap == undefined || networksToNmap == ""){
		//Vasculha todas as interfaces de internet
		var os = require('os');
		var ifaces = os.networkInterfaces();	
		Object.keys(ifaces).forEach(function (ifname) {
			var alias = 0;
			
			//desconsidera essas interfaces
			if (ifname.toLowerCase().indexOf("loopback") > -1 || ifname.toLowerCase().indexOf("tunneling") > -1 ){
				return;
			}
			
			ifaces[ifname].forEach(function (iface) {
				//Somente as que sejam ipv4
				if ('IPv4' !== iface.family || iface.internal !== false) {
					return;
				}

				if (alias >= 1) {
					// this single interface has multiple ipv4 addresses
					//console.log(ifname + ':' + alias, iface.address);
				} else {
					// this interface has only one ipv4 adress
					cidr = subnetToCIDR(iface.netmask);
					ips += getIpRangeNetMask(iface.address+"/"+cidr)[0]+"/"+cidr+" ";
				}
				++alias;
			});
		});
	} else {
		//Usa as redes configuradas
		ips = networksToNmap;
	}
	console.log("["+ips+" "+portsToScan+"]");
	var nmapscan = new nmap.nodenmap.NmapScan (ips,'-p '+portsToScan);
 
	nmapscan.on('complete', function(data){
		for(var i = 0; i < data.length; i++){
		  
		  if (data[i].openPorts != null){
			  
			  for(var y = 0; y < data[i].openPorts.length; y++){
				
				if (data[i].openPorts[y] != undefined){
					hosts.push({'ip':data[i].ip, 'port':data[i].openPorts[y].port});
				}
			  }
		  }
		  
		}
		
		hosts = filtrarVideos(hosts,paths,node,msg);
		
	});
	 
	nmapscan.on('error', function(error){
		console.log("nmap-error");
	  	console.log(error);
	});
	nmapscan.startScan();
	
}

/**
 * Verifica se o host já está na lista
 */
function hostExistsIn(search,list){
	for (var i = 0; i < list.length; i++){
		if (list[i].ip == search){
			return true;
		}
	}
	return false;
}

function subnetToCIDR(mask){
    var maskNodes = mask.match(/(\d+)/g);
    var cidr = 0;
    for(var i in maskNodes) {
        cidr += (((maskNodes[i] >>> 0).toString(2)).match(/1/g) || []).length;
    }
    return cidr;
}

function getIpRangeNetMask(str) {
  var part = str.split("/"); // part[0] = base address, part[1] = netmask
  var ipaddress = part[0].split('.');
  var netmaskblocks = ["0","0","0","0"];
  if(!/\d+\.\d+\.\d+\.\d+/.test(part[1])) {
    // part[1] has to be between 0 and 32
    netmaskblocks = ("1".repeat(parseInt(part[1], 10)) + "0".repeat(32-parseInt(part[1], 10))).match(/.{1,8}/g);
    netmaskblocks = netmaskblocks.map(function(el) { return parseInt(el, 2); });
  } else {
    // xxx.xxx.xxx.xxx
    netmaskblocks = part[1].split('.').map(function(el) { return parseInt(el, 10) });
  }
  // invert for creating broadcast address (highest address)
  var invertedNetmaskblocks = netmaskblocks.map(function(el) { return el ^ 255; });
  var baseAddress = ipaddress.map(function(block, idx) { return block & netmaskblocks[idx]; });
  var broadcastaddress = baseAddress.map(function(block, idx) { return block | invertedNetmaskblocks[idx]; });
  return [baseAddress.join('.'), broadcastaddress.join('.')];
}


