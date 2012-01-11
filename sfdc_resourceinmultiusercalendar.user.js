// ==UserScript==
// @id                   SFDC_ResourceInMultiUserCalendar
// @name                 SFDC_ResourceInMultiUserCalendar
// @description          マルチユーザカレンダーで、リソースカレンダーを表示します。
// @include              https://*.salesforce.com/00U/c*
// ==/UserScript==

var parameter = (function() {
	var parameter = new Parameter();
	
	var paramStrings = location.search.substring(1).split('&');
	for (var i = 0, len = paramStrings.length; i < len; i++) {
		var pv = paramStrings[i].split('='),
			name = pv[0],
			value = pv[1];
		if (name in parameter) {
			parameter[name] = value;
		}
	}
	
	parameter.init();
	
	return parameter;
	
	function Parameter() {
		this.cType = null;
		this.md0 = null;
		this.md1 = null;
		this.md2 = null;
		this.md3 = null;
		this.init = init;
		this.getDateParameters = getDateParameters;
		this.asDate = asDate;
		this.toDaily = toDaily;
		this.toWeekly = toWeekly;
		this.toMonthly = toMonthly;
	}
	function init() {
		this.isMultiUser = this.cType === '2';
		this.isDay = this.md3 != null;
		this.isWeek = this.md2 != null;
		this.isMonth = this.md1 != null;
	}
	function getDaysOfYear(target) {
		var firstDate = new Date(date.getFullYear(), 0, 1);
		return getBetweenDays(firstDate, target);
	}
	function getWeeksOfYear(target) {
		var firstDate = new Date(date.getFullYear(), 0, 1);
		return Math.floor(getBetweenDays(firstDate, target) / 7);
	}
	function getBetweenDays(from, to) {
		var sec = 1000, min = 60*sec, hour = 60*min, day = 24*hour;
		return Math.floor((to - from) / day);
	}
	function getDateParameters() {
		var base = 'md0=' + this.md0;
		if (parameter.isDay) {
			return base + '&md3=' + this.md3;
		} else if (parameter.isWeek) {
			return base + '&md2=' + this.md2;
		} else if (parameter.isMonth) {
			return base + '&md1=' + this.md1;
		}
	}
	function asDate() {
		var y = this.md0,
			m = this.md1,
			w = this.md2,
			d = this.md3;
		
		var date = new Date(y, 0, 1);
		if (m) {
			date.setMonth(m - 1);
		} else if (w) {
			date.setDate(w * 7);
		} else if (d) {
			date.setDate(d);
		}
		
		return date;
	}
	function create(date, name) {
		var p = new Parameter();
		p.md0 = date.getFullYear();
		if (name === 'md1') {
			p.md1 = date.getMonth() + 1;
		} else if (name === 'md2') {
			p.md2 = getWeeksOfYear(date);
		} else if (name === 'md3') {
			p.md3 = getDaysOfYear(date);
		}
		p.init();
		return p;
	}
	function toDaily() {
		return create(this.asDate(), 'md3');
	}
	function toWeekly() {
		return create(this.asDate(), 'md2');
	}
	function toMonthly() {
		return create(this.asDate(), 'md1');
	}
})();


(function(){
	if (! parameter.isMultiUser) {
		return;
	}
	
	var bodyDiv = document.getElementById("bodyCell");
	
	
	// リソース追加による、チェック・名前列の幅伸び防止
	function holdWidth(e) {
		e.style.width = e.scrollWidth + "px"
	}
	holdWidth(document.getElementsByClassName("cbCol")[0]);
	holdWidth(document.getElementById("nameCol"));
	var headerRow = document.getElementsByClassName("headerRow")[0];
	var space = document.createElement('td');
	space.style.width = "100%";
	headerRow.appendChild(space); // テーブルの余白を埋めるためのセル
	
	
	var calTable = document.createElement("table");
	calTable.style.width = "100%";
	calTable.insertRow(0);
	bodyDiv.appendChild(calTable);
	
	// [{name,id}]
	var resources = loadCalendarResources();
	(typeof sortResource === "function") && (resources = resources.sort(sortResource));
	
	for (var i = 0, len = resources.length; i < len; i++) {
		var resource = resources[i];
		var calCell = calTable.rows[0].insertCell(0);
		calCell.style.minWidth = '200px';
		loadResourceCalendar(
			"/00U/c?cType=1&cal_lkid=" + resource.id + "&cal_lspf=1&" + parameter.getDateParameters(),
			calCell,
			resource.id,
			resource.name
		);
	}
	
	// 入力フォームをtableとtrの間から移動し、子要素を見えるようにする。
	var form = document.getElementById("ids");
	var bodyTable = document.getElementById("bodyTable");
	bodyTable.parentNode.appendChild(form);
	form.appendChild(bodyTable);
})();


/**
 * ルックアップページからリソース情報を読み込みます。
 */
function loadCalendarResources() {
	var resources = [];
		url = "/_ui/common/data/LookupResultsFrame?lktp=023&cltp=resource",
		req = new XMLHttpRequest();
	
	req.open("GET", url, false);
	req.send(null);
	
	var res = req.responseText;
	res = res.replace(/(\r\n)|\r|\n/g, '').replace(/^.*?(<table)/, "$1").replace(/(<\/table.*?>).*?$/, "$1");
	
	var parser = new DOMParser();
	var doc = parser.parseFromString(res, "text/xml");
	var listTable = doc.documentElement;
	var rows = Array.prototype.slice.call(listTable.getElementsByTagName("tr"));
	rows.shift();
	for (var i = 0, len = rows.length; i < len; i++) {
		var row = rows[i];
		var link = row.getElementsByTagName("a")[0];
		var name = link.textContent;
		var onclick = link.getAttribute("onclick");
		var id = onclick.match(/023[\d\w]{12}/)[0];
		resources.push({
			"name": name,
			"id": id
		});
	}
	return resources;
}


function sortResource(resource1, resource2) {
	return resource1.name < resource2.name;
}


/**
 * リソースのカレンダーを読み込んで画面に設置する。
 * @param url    
 * @param target 読み込んだカレンダーの設置先要素
 */
function loadResourceCalendar(url, target, id, title) {
	var xhr = new XMLHttpRequest();
	xhr.open("GET" , url , true);
	xhr.onload = function() {
		var htmlDoc = document.cloneNode(false);
		
		if (htmlDoc) {
			htmlDoc.appendChild(htmlDoc.importNode(document.documentElement, false))
			var range = document.createRange();
			range.setStartAfter(document.body);
			var fragment = range.createContextualFragment(xhr.responseText);
			htmlDoc.documentElement.appendChild(fragment)
		} else {
			// Chrome
			htmlDoc = document.createElement("div");
			htmlDoc.innerHTML = xhr.responseText.replace(/.*?<body.*?>/, "").replace(/<\/body>.*/, "");
		}
		
		var calendar;
		var calendarBody = htmlDoc.getElementsByClassName("apexp")[0];
		if (!! calendarBody) {
			calendar = calendarBody.parentNode;
		} else { //Month Calendar
			calendar = htmlDoc.getElementsByClassName("bCalendar")[0];
		}
		
		if (calendar.tagName === "FORM") { // フォームがあると移動後に2重になるため削除
			calendar.parentNode.removeChild(calendar);
			var newCalendar = document.createElement("div");
			moveChildren(calendar, newCalendar);
			calendar = newCalendar;
		}
		
		var calendarWrapper = calendar.getElementsByClassName("bPageBlock apexDefaultPageBlock secondaryPalette")[0];
		if (! calendarWrapper) {
			calendarWrapper = calendar;
		}
		
		var invtee = document.createElement("input");
		invtee.type = "checkbox";
		invtee.name = "invtee";
		invtee.value = id;
		invtee.className = "cbCol";
		calendarWrapper.insertBefore(invtee, calendarWrapper.firstChild);
		
		var titleLink = document.createElement("a");
		titleLink.href = url;
		calendarWrapper.insertBefore(titleLink, calendarWrapper.firstChild);
		var titleElm = document.createElement("h3");
		titleElm.textContent = title;
		titleLink.appendChild(titleElm);
		
		var bCalendar = wrapClass(calendar, ["calendarLayout", "bCalendar"]);
		
		target.appendChild(bCalendar);
	}
	xhr.send();
}


/**
 * 指定したクラスのDIVで要素を包む
 */
function wrapClass(elm, classNames) {
	var targetElm = elm;
	classNames.forEach(function(cName) {
		var div = document.createElement("div");
		div.className = cName;
		div.appendChild(targetElm);
		targetElm = div;
	});
	return targetElm;
}


function moveChildren(from, to) {
	Array.prototype.forEach.call(from.childNodes, function(node){
		if (node.nodeType == 1) {
			to.appendChild(node.cloneNode(true));
		}
	});
}

