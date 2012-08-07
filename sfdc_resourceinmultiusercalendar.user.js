// ==UserScript==
// @id                   SFDC_ResourceInMultiUserCalendar
// @name                 SFDC_ResourceInMultiUserCalendar
// @description          マルチユーザカレンダーで、リソースカレンダーを表示します。
// @include              https://*.salesforce.com/00U/c*
// @updateURL            https://github.com/mino0123/SFDC_ResourceInMultiUserCalendar/raw/master/sfdc_resourceinmultiusercalendar.user.js
// @version              0.0.1
// ==/UserScript==

/*jslint browser: true, regexp: true */
/*global DOMParser */
(function () {
	'use strict';

	function Parameter() {
		var arr = location.search.substring(1).split('&'),
		    len = arr.length,
		    i,
		    pair,
		    name,
		    value;
		this.params = {};
		for (i = 0; i < len; i += 1) {
			pair = arr[i].split('=');
			name = pair[0];
			value = pair[1];
			this.params[name] = value;
		}
		this.isMultiUser = this.params.cType === '2';
		this.isDay = this.params.md3 !== undefined;
		this.isWeek = this.params.md2 !== undefined;
		this.isMonth = this.params.md1 !== undefined;
	}
	Parameter.getDaysOfYear = function (target) {
		var firstDate = new Date(target.getFullYear(), 0, 1);
		return Parameter.getBetweenDays(firstDate, target);
	};
	Parameter.getWeeksOfYear = function (target) {
		var firstDate = new Date(target.getFullYear(), 0, 1);
		return Math.floor(Parameter.getBetweenDays(firstDate, target) / 7);
	};
	Parameter.getBetweenDays = function (from, to) {
		var sec  = 1000,
		    min  = 60 * sec,
		    hour = 60 * min,
		    day  = 24 * hour;
		return Math.floor((to - from) / day);
	};
	Parameter.prototype.getDateParameters = function () {
		var base = 'md0=' + this.params.md0;
		if (this.isDay) {
			return base + '&md3=' + this.params.md3;
		} else if (this.isWeek) {
			return base + '&md2=' + this.params.md2;
		} else if (this.isMonth) {
			return base + '&md1=' + this.params.md1;
		}
	};
	Parameter.prototype.asDate = function () {
		var y = this.params.md0,
			m = this.params.md1,
			w = this.params.md2,
			d = this.params.md3,
		    date = new Date(y, 0, 1);
		if (m) {
			date.setMonth(m - 1);
		} else if (w) {
			date.setDate(w * 7);
		} else if (d) {
			date.setDate(d);
		}
		return date;
	};
	Parameter.prototype.create = function (date, name) {
		var p = new Parameter();
		p.params.md0 = date.getFullYear();
		if (name === 'md1') {
			p.params.md1 = date.getMonth() + 1;
		} else if (name === 'md2') {
			p.params.md2 = Parameter.getWeeksOfYear(date);
		} else if (name === 'md3') {
			p.params.md3 = Parameter.getDaysOfYear(date);
		}
		return p;
	};
	Parameter.prototype.toDaily = function () {
		return this.create(this.asDate(), 'md3');
	};
	Parameter.prototype.toWeekly = function () {
		return this.create(this.asDate(), 'md2');
	};
	Parameter.prototype.toMonthly = function () {
		return this.create(this.asDate(), 'md1');
	};

	function holdWidth(e) {
		if (e) {
			e.style.width = e.scrollWidth + 'px';
		}
	}

	function initCalendarTable() {
		var headerRow = document.getElementsByClassName('headerRow')[0],
		    space = document.createElement('td');
		// テーブルの余白を埋めるためのセル
		space.style.width = '100%';
		headerRow.appendChild(space);
		// リソース追加による、チェック・名前列の幅伸び防止
		holdWidth(document.getElementsByClassName('calendarTable')[0]);
		holdWidth(document.getElementsByClassName('cbCol')[0]);
		holdWidth(document.getElementById('nameCol'));
		// TODO 1日カレンダーでもcb,namecol以外を100%にすれば縮まらない
	}

	function appendResourcesTable(parent) {
		var table = document.createElement('table');
		table.style.width = '100%';
		table.insertRow(0);
		parent.appendChild(table);
		return table;
	}

	function scrapeResourceRow(row) {
		var link = row.getElementsByTagName('a')[0],
		    name = link.textContent,
		    onclick = link.getAttribute('onclick'),
		    id = onclick.match(/023[\d\w]{12}/)[0];
		return {id: id, name: name};
	}

	function scrapeResourceList(html) {
		var resources = [],
		    text,
		    parser = new DOMParser(),
		    doc,
		    rows,
		    len,
		    i;
		html = html.replace(/(\r\n)|\r|\n/g, '');
		text = html.match(/<table.*<\/table>/)[0];
		doc = parser.parseFromString(text, 'text/xml');
		rows = Array.prototype.slice.call(doc.documentElement.getElementsByTagName('tr'));
		rows.shift(); // skip header
		len = rows.length;
		for (i = 0; i < len; i += 1) {
			resources.push(scrapeResourceRow(rows[i]));
		}
		return resources;
	}

	function loadResourceList() {
		var resources = [],
			url = '/_ui/common/data/LookupResultsFrame?lktp=023&cltp=resource',
			req = new XMLHttpRequest();
		req.open('GET', url, false);
		req.send(null);
		return scrapeResourceList(req.responseText);
	}

	function sortResource(resource1, resource2) {
		return resource1.name < resource2.name;
	}

	function scrapeResouceCalendar(html) {
		var doc = document.cloneNode(false),
		    range,
		    fragment;
		if (doc) {
			// Firefox
			doc.appendChild(doc.importNode(document.documentElement, false));
			range = document.createRange();
			range.setStartAfter(document.body);
			fragment = range.createContextualFragment(html);
			doc.documentElement.appendChild(fragment);
		} else {
			// Chrome
			doc = document.createElement('div');
			doc.innerHTML = html.replace(/.*?<body.*?>/, '').replace(/<\/body>.*/, '');
		}
		return doc;
	}

	function getCalendarElement(html) {
		var doc = scrapeResouceCalendar(html),
		    calendar,
		    calendarBody = doc.getElementsByClassName('apexp')[0];
		if (calendarBody) {
			calendar = calendarBody.parentNode;
		} else { //Month Calendar
			calendar = doc.getElementsByClassName('bCalendar')[0];
		}
		return calendar;
	}

	function moveChildren(from, to) {
		Array.prototype.forEach.call(from.childNodes, function (node) {
			if (node.nodeType === 1) {
				to.appendChild(node.cloneNode(true));
			}
		});
	}

	function removeFormElement(element) {
		if (element.tagName === 'FORM') {
			element.parentNode.removeChild(element);
			var newCalendar = document.createElement('div');
			moveChildren(element, newCalendar);
			return newCalendar;
		} else {
			return element;
		}
	}

	function loadResouceCalendar(resource, callback) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', resource.url, true);
		xhr.onload = function () {
			var calendar = getCalendarElement(xhr.responseText);
			calendar = removeFormElement(calendar); // フォームがあると移動後に2重になるため削除
			callback(calendar);
		};
		xhr.send();
	}

	function appendInvtee(calendar, resource) {
		var calendarWrapper,
		    invtee,
		    titleLink,
		    titleElm;
		calendarWrapper = calendar.getElementsByClassName('bPageBlock apexDefaultPageBlock secondaryPalette')[0];
		if (!calendarWrapper) {
			calendarWrapper = calendar;
		}
		invtee = document.createElement('input');
		invtee.type = 'checkbox';
		invtee.name = 'invtee';
		invtee.value = resource.id;
		invtee.className = 'cbCol';
		calendarWrapper.insertBefore(invtee, calendarWrapper.firstChild);
		titleLink = document.createElement('a');
		titleLink.href = resource.url;
		calendarWrapper.insertBefore(titleLink, calendarWrapper.firstChild);
		titleElm = document.createElement('h3');
		titleElm.textContent = resource.name;
		titleLink.appendChild(titleElm);
	}

	function wrapClass(elm, classNames) {
		var targetElm = elm;
		classNames.forEach(function (cName) {
			var div = document.createElement('div');
			div.className = cName;
			div.appendChild(targetElm);
			targetElm = div;
		});
		return targetElm;
	}

	function createOnResourceLoaded(resource, cell) {
		return function (calendar) {
			appendInvtee(calendar, resource);
			var bCalendar = wrapClass(calendar, ['calendarLayout', 'bCalendar']);
			cell.appendChild(bCalendar);
		};
	}

	function loadResourceCalendars(parent, resources) {
		var len = resources.length,
		    i,
		    r,
		    cell;
		for (i = 0; i < len; i += 1) {
			r = resources[i];
			cell = parent.rows[0].insertCell(0);
			cell.style.minWidth = '200px';
			loadResouceCalendar(r, createOnResourceLoaded(r, cell));
		}
	}


	var parameter,
	    bodyDiv,
	    resourcesTable,
	    resources,
	    dateParamStr,
	    form,
	    bodyTable;
	parameter = new Parameter();

	if (!parameter.isMultiUser) {
		return;
	}

	initCalendarTable();
	bodyDiv = document.getElementById('bodyCell');
	resourcesTable = appendResourcesTable(bodyDiv);
	resources = loadResourceList();
	resources = resources.sort(sortResource);
	dateParamStr = parameter.getDateParameters();
	resources.forEach(function (r) {
		r.url = '/00U/c?cType=1&cal_lkid=' + r.id + '&cal_lspf=1&' + dateParamStr;
	});
	loadResourceCalendars(resourcesTable, resources);

	// フォームをtableとtrの間から移動し、子要素を見えるようにする。
	form = document.getElementById('ids');
	bodyTable = document.getElementById('bodyTable');
	bodyTable.parentNode.appendChild(form);
	form.appendChild(bodyTable);
}());
