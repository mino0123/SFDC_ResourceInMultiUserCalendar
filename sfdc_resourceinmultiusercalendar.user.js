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

	function ResourceListLoader() {
	}

	ResourceListLoader.scrapeResourceRow = function (row) {
		var link = row.getElementsByTagName('a')[0],
		    name = link.textContent,
		    onclick = link.getAttribute('onclick'),
		    id = onclick.match(/023[\d\w]{12}/)[0];
		return {id: id, name: name};
	};

	ResourceListLoader.scrapeResourceList = function (html) {
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
			resources.push(this.scrapeResourceRow(rows[i]));
		}
		return resources;
	};

	ResourceListLoader.loadResourceList = function () {
		var resources = [],
			url = '/_ui/common/data/LookupResultsFrame?lktp=023&cltp=resource',
			req = new XMLHttpRequest();
		req.open('GET', url, false);
		req.send(null);
		return this.scrapeResourceList(req.responseText);
	};

	function ResourceLoader(resource) {
		this.resource = resource;
	}

	ResourceLoader.prototype.scrapeResouceCalendar = function (html) {
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
	};

	ResourceLoader.prototype.getCalendarElement = function (html) {
		var doc = this.scrapeResouceCalendar(html),
		    calendar,
		    calendarBody = doc.getElementsByClassName('apexp')[0];
		if (calendarBody) {
			calendar = calendarBody.parentNode;
		} else { //Month Calendar
			calendar = doc.getElementsByClassName('bCalendar')[0];
		}
		return calendar;
	};

	ResourceLoader.prototype.load = function (callback) {
		var xhr = new XMLHttpRequest(),
		    that = this;
		xhr.open('GET', this.resource.url, true);
		xhr.onload = function () {
			var calendar = that.getCalendarElement(xhr.responseText);
			callback(calendar, that.resource);
		};
		xhr.send();
	};

	ResourceLoader.loadResources = function (resources, callback) {
		var len = resources.length,
		    i,
		    loader;
		for (i = 0; i < len; i += 1) {
			loader = new ResourceLoader(resources[i]);
			loader.load(callback);
		}
	};

	function PageReformer() {
	}

	PageReformer.holdWidth = function (e) {
		e.style.width = e.scrollWidth + 'px';
	};

	PageReformer.initCalendarTable = function () {
		var headerRow = document.getElementsByClassName('headerRow')[0],
		    space = document.createElement('td');
		// テーブルの余白を埋めるためのセル
		space.style.width = '100%';
		headerRow.appendChild(space);
		// リソース追加による、チェック・名前列の幅伸び防止
		this.holdWidth(document.getElementsByClassName('calendarTable')[0]);
		this.holdWidth(document.getElementsByClassName('cbCol')[0]);
		this.holdWidth(document.getElementById('nameCol'));
		// TODO 1日カレンダーでもcb,namecol以外を100%にすれば縮まらない
	};

	PageReformer.initResourceListTable = function (parent) {
		var table = document.createElement('table');
		table.style.width = '100%';
		table.insertRow(0);
		parent.appendChild(table);
		return table;
	};

	PageReformer.moveChildren = function (from, to) {
		Array.prototype.forEach.call(from.childNodes, function (node) {
			if (node.nodeType === 1) {
				to.appendChild(node.cloneNode(true));
			}
		});
	};

	PageReformer.removeFormElement = function (element) {
		if (element.tagName === 'FORM') {
			element.parentNode.removeChild(element);
			var newCalendar = document.createElement('div');
			this.moveChildren(element, newCalendar);
			return newCalendar;
		} else {
			return element;
		}
	};

	PageReformer.appendInvtee = function (calendar, resource) {
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
	};

	PageReformer.wrapClass = function (elm, classNames) {
		var targetElm = elm;
		classNames.forEach(function (cName) {
			var div = document.createElement('div');
			div.className = cName;
			div.appendChild(targetElm);
			targetElm = div;
		});
		return targetElm;
	};

	PageReformer.appendResourceCalendar = function (calendar, resource, cell) {
		calendar = this.removeFormElement(calendar); // フォームがあると移動後に2重になるため削除
		this.appendInvtee(calendar, resource);
		cell.appendChild(this.wrapClass(calendar, ['calendarLayout', 'bCalendar']));
	};

	// フォームをtableとtrの間から移動し、子要素を見えるようにする。
	PageReformer.moveForm = function () {
		var form = document.getElementById('ids'),
		    bodyTable = document.getElementById('bodyTable');
		bodyTable.parentNode.appendChild(form);
		form.appendChild(bodyTable);
	};


	var parameter,
	    bodyDiv,
	    resourcesTable,
	    resources,
	    dateParamStr,
	    cellHash = {};
	parameter = new Parameter();

	if (!parameter.isMultiUser) {
		return;
	}

	PageReformer.initCalendarTable();
	bodyDiv = document.getElementById('bodyCell');
	resourcesTable = PageReformer.initResourceListTable(bodyDiv);
	resources = ResourceListLoader.loadResourceList();
	resources = resources.sort(function (r1, r2) {
		return r1.name < r2.name;
	});
	dateParamStr = parameter.getDateParameters();
	resources.forEach(function (r) {
		r.url = '/00U/c?cType=1&cal_lkid=' + r.id + '&cal_lspf=1&' + dateParamStr;
		// リソース追加先
		var cell = resourcesTable.rows[0].insertCell(0);
		cell.style.minWidth = '200px';
		cellHash[r.id] = cell;
	});
	ResourceLoader.loadResources(resources, function (calendar, resource) {
		PageReformer.appendResourceCalendar(calendar, resource, cellHash[resource.id]);
	});
	PageReformer.moveForm();

}());
