/**
 * Javascript functions for the frontend
 * 
 * @author Florian Ziegler <fz@f10-home.de>
 * @author Justin Otherguy <justin@justinotherguy.org>
 * @author Steffen Vogel <info@steffenvogel.de>
 * @copyright Copyright (c) 2010, The volkszaehler.org project
 * @package default
 * @license http://opensource.org/licenses/gpl-license.php GNU Public License
 */
/*
 * This file is part of volkzaehler.org
 * 
 * volkzaehler.org is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or any later version.
 * 
 * volkzaehler.org is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 * 
 * You should have received a copy of the GNU General Public License along with
 * volkszaehler.org. If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Initialize the WUI (Web User Interface)
 */
vz.wui.init = function() {
	// initialize dropdown accordion
	$('#accordion h3').click(function() {
		$(this).next().toggle('fast');
		return false;
	}).next().hide();
	$('#entity-list').show(); // open entity list by default
	
	// buttons
	$('button, input[type=button],[type=image]').button();
	$('button[name=options-save]').click(function() { vz.options.save(); });
	$('#permalink').click(function() {
		var uuids = [];
		var url = window.location.protocol + '//' +
			window.location.host +
			window.location.pathname +
			'?from=' + vz.options.plot.xaxis.min +
			'&to=' + vz.options.plot.xaxis.max;

		vz.entities.each(function(entity, parent) {
			if (entity.active && entity.definition.model == 'Volkszaehler\\Model\\Channel') {
				uuids.push(entity.uuid);
			}
		});
		
		uuids.unique().each(function(key, value) {
			url += '&uuid=' + value;
		});

		window.location = url;
	});
	$('button[name=entity-add]').click(vz.wui.dialogs.init);
	
	// bind plot actions
	$('#controls button').click(this.handleControls);
	$('#controls').buttonset();
	
	// tuple resolution
	vz.options.tuples = Math.round($('#flot').width() / 4);
	$('#tuples').val(vz.options.tuples).change(function() {
		vz.options.tuples = $(this).val();
		vz.entities.loadData();
	});

	// backend address
	$('#backend-url')
		.val(vz.options.backendUrl)
		.change(function() {
			vz.options.backendUrl = $(this).val();
		});

	// auto refresh
	if (vz.options.refresh) {
		$('#refresh').attr('checked', true);
		vz.wui.timeout = window.setTimeout(vz.wui.refresh, 3000);
	}
	$('#refresh').change(function() {
		if ($(this).attr('checked')) {
			vz.options.refresh = true;
			vz.wui.timeout = window.setTimeout(vz.wui.refresh, 3000);
		}
		else {
			vz.options.refresh = false;
			window.clearTimeout(vz.wui.timeout);
		}
	});
	
	// plot rendering
	$('#render-lines').attr('checked', (vz.options.render == 'lines'));
	$('#render-points').attr('checked', (vz.options.render == 'points'));
	$('input[name=render][type=radio]').change(function() {
		if ($(this).attr('checked')) {
			vz.options.render = $(this).val();
			vz.wui.drawPlot();
		}
	});
};

/**
 * Initialize dialogs
 */
vz.wui.dialogs.init = function() {
	// initialize dialogs
	$('#entity-add.dialog').dialog({
		title: 'Kanal hinzuf&uuml;gen',
		width: 530,
		resizable: false
	});
	$('#entity-add.dialog > div').tabs();
	
	// load public entities
	vz.load({
		context: 'entity',
		success: function(json) {
			if (json.entities.length > 0) {
				json.entities.each(function(index, entity) {
					$('#entity-subscribe-public select#public').append(
						$('<option>').text(entity.title).data('entity', entity)
					);
				});
			}
			else {
			
			}
		}
	});
	
	// show available entity types
	vz.capabilities.definitions.entities.each(function(index, def) {
		$('#entity-create select#type').append(
			$('<option>').text(def.translation[vz.options.language]).data('definition', def)
		);
	});

	/*$('#entity-create select#type option:selected').data('definition').required.each(function(index, property) {
		$('#entity-create #properties').append(
			vz.capabilities.definitions.get('properties', property).getDOM()
		)
	});*/
	
	// actions
	$('#entity-subscribe input[type=button]').click(function() {
		try {
			var uuid = $('#entity-subscribe input#uuid');
			vz.uuids.add(uuid.val());

			if ($('#entity-subscribe input.cookie').attr('checked')) {
				vz.uuids.save();
			}
			
			vz.entities.loadDetails(); // reload entity details and load data
		}
		catch (e) {
			vz.wui.dialogs.exception(e);
		}
		finally {
			$('#entity-add').dialog('close');
			$('#entity-add input[type!=button]').val(''); // reset form
			$('#entity-add input.cookie').attr('checked', false); // reset form
		}
	});
	
	$('#entity-subscribe-public input[type=button]').click(function() {
		var entity = $('#entity-subscribe-public select#public option:selected').data('entity');
	
		try {
			vz.uuids.add(entity.uuid);

			if ($('#entity-subscribe-public input.cookie').attr('checked')) {
				vz.uuids.save();
			}
			
			vz.entities.loadDetails(); // reload entity details and load data
		}
		catch (e) {
			vz.wui.dialogs.exception(e);
		}
		finally {
			$('#entity-add').dialog('close');
			$('#entity-add input[type!=button]').val(''); // reset form
			$('#entity-add input.cookie').attr('checked', false); // reset form
		}
	});
	
	/*$('#entity-create input[type=button]').click(function() {

	});*/
	
	// update event handler
	$('button[name=entity-add]').unbind('click', vz.wui.dialogs.init);
	$('button[name=entity-add]').click(function() {
		$('#entity-add.dialog').dialog('open');
	});
};

/**
 * Bind events to handle plot zooming & panning
 */
vz.wui.initEvents = function() {
	$('#plot')
		.bind("plotselected", function (event, ranges) {
			vz.options.plot.xaxis.min = ranges.xaxis.from;
			vz.options.plot.xaxis.max = ranges.xaxis.to;
			vz.options.plot.yaxis.max = null; // autoscaling
			vz.options.plot.yaxis.min = 0; // fixed to 0
			vz.entities.loadData();
		})
		/*.bind('plotpan', function (event, plot) {
			var axes = plot.getAxes();
			vz.options.plot.xaxis.min = axes.xaxis.min;
			vz.options.plot.xaxis.max = axes.xaxis.max;
			vz.options.plot.yaxis.min = axes.yaxis.min;
			vz.options.plot.yaxis.max = axes.yaxis.max;
		})
		.bind('mouseup', function(event) {
			vz.entities.loadData();
		})*/
		.bind('plotzoom', function (event, plot) {
			var axes = plot.getAxes();
			vz.options.plot.xaxis.min = axes.xaxis.min;
			vz.options.plot.xaxis.max = axes.xaxis.max;
			vz.options.plot.yaxis.min = axes.yaxis.min;
			vz.options.plot.yaxis.max = axes.yaxis.max;
			vz.entities.loadData();
		});
};

/**
 * Refresh plot with new data
 */
vz.wui.refresh = function() {
	var delta = vz.options.plot.xaxis.max - vz.options.plot.xaxis.min;
	
	vz.options.plot.xaxis.max = new Date().getTime();		// move plot
	vz.options.plot.xaxis.min = vz.options.plot.xaxis.max - delta;	// move plot
	vz.entities.loadData();
	
	vz.wui.timeout = window.setTimeout(vz.wui.refresh, (delta / 100 < 3000) ? 3000 : delta / 100); // TODO update timeout after zooming
};

/**
 * Move & zoom in the plotting area
 */
vz.wui.handleControls = function () {
	var delta = vz.options.plot.xaxis.max - vz.options.plot.xaxis.min;
	var middle = vz.options.plot.xaxis.min + delta/2;

	switch($(this).val()) {
		case 'move-last':
			vz.options.plot.xaxis.max = new Date().getTime();
			vz.options.plot.xaxis.min = new Date().getTime() - delta;
			break;
		case 'move-back':
			vz.options.plot.xaxis.min -= delta;
			vz.options.plot.xaxis.max -= delta;
			break;
		case 'move-forward':
			vz.options.plot.xaxis.min += delta;
			vz.options.plot.xaxis.max += delta;
			break;
		case 'zoom-reset':
			vz.options.plot.xaxis.min = middle - vz.options.defaultInterval/2;
			vz.options.plot.xaxis.max =  middle + vz.options.defaultInterval/2;
			break;
		case 'zoom-in':
			vz.options.plot.xaxis.min += delta/4;
			vz.options.plot.xaxis.max -= delta/4;
			break;
		case 'zoom-out':
			vz.options.plot.xaxis.min -= delta;
			vz.options.plot.xaxis.max += delta;
			break;
		case 'zoom-hour':
			hour = 60*60*1000;
			vz.options.plot.xaxis.min = middle - hour/2;
			vz.options.plot.xaxis.max =  middle + hour/2;
			break;
		case 'zoom-day':
			var day = 24*60*60*1000;
			vz.options.plot.xaxis.min = middle - day/2;
			vz.options.plot.xaxis.max =  middle + day/2;
			break;
		case 'zoom-week':
			var week = 7*24*60*60*1000;
			vz.options.plot.xaxis.min = middle - week/2;
			vz.options.plot.xaxis.max =  middle + week/2;
			break;
		case 'zoom-month':
			var month = 30*24*60*60*1000;
			vz.options.plot.xaxis.min = middle - month/2;
			vz.options.plot.xaxis.max =  middle + month/2;
			break;
		case 'zoom-year':
			var year = 365*24*60*60*1000;
			vz.options.plot.xaxis.min = middle - year/2;
			vz.options.plot.xaxis.max =  middle + year/2;
			break;
	}

	// reenable autoscaling for yaxis
	vz.options.plot.yaxis.max = null; // autoscaling
	vz.options.plot.yaxis.min = 0; // fixed to 0
	
	// we dont want to zoom/pan into the future
	if (vz.options.plot.xaxis.max > new Date().getTime()) {
		delta = vz.options.plot.xaxis.max - vz.options.plot.xaxis.min;
		vz.options.plot.xaxis.max = new Date().getTime();
		vz.options.plot.xaxis.min = new Date().getTime() - delta;
	}
	
	vz.entities.loadData();
};

/**
 * Rounding precission
 *
 * Math.round rounds to whole numbers
 * to round to one decimal (e.g. 15.2) we multiply by 10,
 * round and reverse the multiplication again
 * therefore "vz.options.precission" needs
 * to be set to 1 (for 1 decimal) in that case
 */
vz.wui.formatNumber = function(number) {
	return Math.round(number*Math.pow(10, vz.options.precission))/Math.pow(10, vz.options.precission);
}

vz.wui.updateHeadline = function() {
	var from = $.plot.formatDate(new Date(vz.options.plot.xaxis.min + vz.options.timezoneOffset), '%d. %b %h:%M:%S', vz.options.plot.xaxis.monthNames);
	var to = $.plot.formatDate(new Date(vz.options.plot.xaxis.max + vz.options.timezoneOffset), '%d. %b %h:%M:%S', vz.options.plot.xaxis.monthNames);
	$('#title').text(from + ' - ' + to);
}

/**
 * Overwritten each iterator to iterate recursively throug all entities
 */
vz.entities.each = function(cb) {
	for (var i = 0; i < this.length; i++) {
		this[i].each(cb);
	}
}

/**
 * Get all entity information from backend
 */
vz.entities.loadDetails = function() {
	vz.entities.clear();
	
	vz.uuids.each(function(index, value) {
		vz.load({
			context: 'entity',
			identifier: value,
			success: vz.wait(function(json) {
				vz.entities.push(new Entity(json.entity));
			}, vz.entities.showTable, 'information')
		});
	});
};

/**
 * Create nested entity list
 *
 * @todo move to Entity class
 */
vz.entities.showTable = function() {
	$('#entity-list tbody').empty();
	
	var c = 0; // for colors
	
	vz.entities = vz.entities.sort(function(e1, e2) {
		e1.title > e2.title;
	});
	
	vz.entities.each(function(entity, parent) {
		entity.color = vz.options.plot.colors[c++ % vz.options.plot.colors.length];
		entity.active = (entity.active) ? entity.active : true; // TODO check
	
		var row = $('<tr>')
			.addClass((parent) ? 'child-of-entity-' + parent.uuid : '')
			.addClass((entity.definition.model == 'Volkszaehler\\Model\\Aggregator') ? 'aggregator' : 'channel')
			.attr('id', 'entity-' + entity.uuid)
			.append($('<td>')
				.addClass('visibility')
				.css('background-color', entity.color)
				.append($('<input>')
					.attr('type', 'checkbox')
					.attr('checked', entity.active)
					.bind('change', function(event) {
						var state = $(this).attr('checked');
						
						entity.each(function(child) {
							$('#entity-' + child.uuid + '.child-of-entity-' + entity.uuid + ' input[type=checkbox]').attr('checked', state);
							child.active = state;
						});

						vz.wui.drawPlot();
					})
				)
			)
			.append($('<td>').addClass('expander'))
			.append($('<td>')
				.append($('<span>')
					.text(entity.title)
					.addClass('indicator')
				)
			)
			.append($('<td>').text(entity.definition.translation[vz.options.language])) // channel type
			.append($('<td>').addClass('min'))		// min
			.append($('<td>').addClass('max'))		// max
			.append($('<td>').addClass('average'))		// avg
			.append($('<td>').addClass('consumption'))	// consumption
			.append($('<td>').addClass('last'))		// last
			.append($('<td>')				// operations
				.addClass('ops')
				.append($('<input>')
					.attr('type', 'image')
					.attr('src', 'images/information.png')
					.attr('alt', 'details')
					.bind('click', entity, function(event) { event.data.showDetails(); })
				)
			)
			.data('entity', entity);
				
		if (vz.uuids.contains(entity.uuid)) { // removable from cookies?
			$('td.ops', row).prepend($('<input>')
				.attr('type', 'image')
				.attr('src', 'images/delete.png')
				.attr('alt', 'delete')
				.bind('click', entity, function(event) {
					vz.uuids.remove(event.data.uuid);
					vz.uuids.save();
					vz.entities.loadDetails();
				})
			);
		}
		
		$('#entity-list tbody').append(row);
	});

	/*
	 * Initialize treeTable
	 * 
	 * http://ludo.cubicphuse.nl/jquery-plugins/treeTable/doc/index.html
	 * https://github.com/ludo/jquery-plugins/tree/master/treeTable
	 */
	// configure entities as draggable
	$('#entity-list tr.channel span.indicator, #entity-list tr.aggregator span.indicator').draggable({
		helper:  'clone',
		opacity: .75,
		refreshPositions: true, // Performance?
		revert: 'invalid',
		revertDuration: 300,
		scroll: true
	});

	// configure aggregators as droppable
	$('#entity-list tr.aggregator span.indicator').each(function() {
		$(this).parents('tr').droppable({
			//accept: 'tr.channel span.indicator, tr.aggregator span.indicator',
			drop: function(event, ui) {
				var child = $(ui.draggable.parents('tr')[0]).data('entity');
				var from = child.parent;
				var to = $(this).data('entity');
				
				$('#entity-move').dialog({ // confirm prompt
					resizable: false,
					modal: true,
					title: 'Verschieben',
					width: 400,
					buttons: {
						'Verschieben': function() {
							try {
								to.addChild(child); // add to new aggregator
					
								if (typeof from != 'undefined') {
									from.removeChild(child); // remove from aggregator
								}
								else {
									vz.uuids.remove(child.uuid); // remove from cookies
									vz.uuids.save();
								}
							} catch (e) {
								vz.wui.dialogs.exception(e);
							} finally {
								$(this).dialog('close');
							}
						},
						'Abbrechen': function() {
							$(this).dialog('close');
						}
					}
				});
			},
			hoverClass: 'accept',
			over: function(event, ui) {
				// make the droppable branch expand when a draggable node is moved over it
				if (this.id != $(ui.draggable.parents('tr')[0]).id && !$(this).hasClass('expanded')) {
					$(this).expand();
				}
			}
		});
	});

	// make visible that a row is clicked
	$('#entity-list table tbody tr').mousedown(function() {
		$('tr.selected').removeClass('selected'); // deselect currently selected rows
		$(this).addClass('selected');
	});

	// make sure row is selected when span is clicked
	$('#entity-list table tbody tr span').mousedown(function() {
		$($(this).parents('tr')[0]).trigger('mousedown');
	});
	
	$('#entity-list table').treeTable({
		treeColumn: 2,
		clickableNodeNames: true,
		initialState: 'expanded'
	});
	
	// load data and show plot
	vz.entities.loadData();
};

/**
 * Load json data from the backend
 *
 * @todo move to Entity class
 */
vz.entities.loadData = function() {
	$('#overlay').html('<img src="images/loading.gif" alt="loading..." /><p>loading...</p>');
	vz.entities.each(function(entity) {
		if (entity.active && entity.type != 'group') { // TODO add group data aggregation
			//var delta = vz.options.plot.xaxis.max - vz.options.plot.xaxis.min;
			//var offset = delta * 0.1;
			var offset = 1000*60*60; // load additional data to avoid paddings
	
			vz.load({
				context: 'data',
				identifier: entity.uuid,
				data: {
					from: Math.floor(vz.options.plot.xaxis.min - offset), // TODO fuzy-logic to get enough data
					to: Math.ceil(vz.options.plot.xaxis.max + offset),
					tuples: vz.options.tuples
				},
				success: vz.wait(function(json) {
					entity.data = json.data;
				
					if (entity.data.min !== null && entity.data.min[1] < vz.options.plot.yaxis.min) { // allow negative values for temperature sensors
						vz.options.plot.yaxis.min = null;
					}
				
					// update entity table
					var unit = ' ' + entity.definition.unit;
					$('#entity-' + entity.uuid + ' .min')
						.text(
							(entity.data.min !== null) ? vz.wui.formatNumber(entity.data.min[1]) + unit : '-')
						.attr('title', (entity.data.min !== null) ? $.plot.formatDate(new Date(entity.data.min[0]), '%d. %b %h:%M:%S', vz.options.plot.xaxis.monthNames) : '');
					$('#entity-' + entity.uuid + ' .max')
						.text((entity.data.max !== null) ? vz.wui.formatNumber(entity.data.max[1]) + unit : '-')
						.attr('title', (entity.data.max !== null) ? $.plot.formatDate(new Date(entity.data.max[0]), '%d. %b %h:%M:%S', vz.options.plot.xaxis.monthNames) : '');
					$('#entity-' + entity.uuid + ' .average').text((entity.data.average !== null) ? vz.wui.formatNumber(entity.data.average) + unit : '');
					$('#entity-' + entity.uuid + ' .last').text((entity.data.tuples) ? vz.wui.formatNumber(entity.data.tuples.last()[1]) + unit : '');
					if (entity.definition.interpreter == 'Volkszaehler\\Interpreter\\MeterInterpreter') { // sensors have no consumption
						$('#entity-' + entity.uuid + ' .consumption').text(vz.wui.formatNumber(entity.data.consumption) + unit + 'h');
					}
				}, vz.wui.drawPlot, 'data')
			});
		}
	});
};

/**
 * Draws plot to container
 */
vz.wui.drawPlot = function () {
	vz.wui.updateHeadline();

	var data = new Array;
	vz.entities.each(function(entity) {
		if (entity.active && entity.data && entity.data.tuples && entity.data.tuples.length > 0) {
			data.push({
				data: entity.data.tuples,
				color: entity.color
			});
		}
	});
	
	if (data.length == 0) {
		$('#overlay').html('<img src="images/empty.png" alt="no data..." /><p>nothing to plot...</p>');
		data.push({});  // add empty dataset to show axes
	}
	else {
		$('#overlay').empty();
	}

	vz.options.plot.series.lines.show = (vz.options.render == 'lines');
	vz.options.plot.series.points.show = (vz.options.render == 'points');

	vz.plot = $.plot($('#flot'), data, vz.options.plot);
};

/*
 * Error & Exception handling
 */
 
var Exception = function(type, message, code) {
	return {
		type: type,
		message: message,
		code: code
	};
}

vz.wui.dialogs.error = function(error, description, code) {
	if (typeof code != 'undefined') {
		error = code + ': ' + error;
	}

	$('<div>')
	.append($('<span>').text(description))
	.dialog({
		title: error,
		width: 450,
		dialogClass: 'ui-error',
		resizable: false,
		modal: true,
		buttons: {
			Ok: function() {
				$(this).dialog('close');
			}
		}
	});
};

vz.wui.dialogs.exception = function(exception) {
	this.error(exception.type, exception.message, exception.code);
};