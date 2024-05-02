/* 	Triangulate 1.1.0
	 	Made by TwigGlenn4

		A DroidScript app to find the location of a distant object by aiming at it from two locations.
*/


const DEBUG = false;
// global vars
var current_location = { // contains current location info, updated by Tracker functions
	latitude: 0,
	longitude: 0,
  bearing: 0
};

var point1 = {
	latitude: 0,
	longitude: 0,
	bearing: 0
};
var point2 = {
	latitude: 0,
	longitude: 0,
	bearing: 0
};
var target = {
	latitude: 0,
	longitude: 0
}

var layout;
var cam_preview;
var zoom_slider;

var aim_text;

var point1_text;
var point1_btn;

var point2_text;
var point2_btn;

var target_text;

var maps_btn;


// only enable button if not already enabled to reduce log spam. Uses a custom property of button object
function enableButton( button ) {
	if( !button.triangulate_enabled ) {
		button.SetEnabled(true);
		button.triangulate_enabled = true;
	}
}

// Tracker functions keep current_location updated with sensor data
function locationTracker(pos) {
	current_location.latitude = pos.latitude;
	current_location.longitude = pos.longitude;
	updateAimText()
}
function compassTracker(azimuth) {
	current_location.bearing = azimuth;
	updateAimText()
}
function updateAimText() {
	if(ValidatePoint(current_location)) {
		enableButton(point1_btn);
		enableButton(point2_btn);
		
		aim_text.SetHtml(`<b>Lat/long:</b> ${fixed(current_location.latitude)}, ${fixed(current_location.longitude)}<br/>
<b>Bearing: </b> ${fixed(current_location.bearing)}`)
	}
}

// Helper functions for the SetPoint functions
function fixed(x) {
	return Number.parseFloat(x).toFixed(6);
}
function PointTextConstructor(name, point) {
	return `<b>${name}:</b> ${fixed(point.latitude)}, ${fixed(point.longitude)}, ${fixed(point.bearing)}`;
}
function ValidatePoint(point) {
	if(point.latitude == 0 || point.longitude == 0 || point.bearing == 0) {
		return false;
	}
	return true;
}


// Button callbacks
function SetPoint1() {
	// read data from current_location
	point1.latitude = current_location.latitude;
	point1.longitude = current_location.longitude;
	point1.bearing = current_location.bearing;
	
	// Validate point data and update UI
	if(ValidatePoint(point1)) {
		console.log(JSON.stringify(point1));
		point1_text.SetHtml(PointTextConstructor("Point 1", point1))

		// Triangulate if both points are valid
		if( ValidatePoint(point2) ) {
			TriangulateCallback()
		}
	}
	else { // Alert if invalid
		app.ShowPopup("Point 1 was not updated.", "Short")
	}

}
function SetPoint2() {
	// read data from current_location
	point2.latitude = current_location.latitude;
	point2.longitude = current_location.longitude;
	point2.bearing = current_location.bearing;
	
	// Validate point data and update UI
	if(ValidatePoint(point2)) {
		console.log(JSON.stringify(point2));
		point2_text.SetHtml(PointTextConstructor("Point 2", point2));

		// Triangulate if both points are valid
		if( ValidatePoint(point1) ) {
			TriangulateCallback()

		}
	}
	else { // Alert if invalid
		app.ShowPopup("Point 2 was not updated.", "Short");
	}
}
function mapCallback() {
	app.OpenUrl(`https://maps.google.com/?q=${target.latitude},${target.longitude}`)
}


// Callbacks for other UI elements
function camReadyCallback() {
	var cam_max_zoom = cam_preview.GetMaxZoom();
	cam_preview.SetZoom(cam_max_zoom/2);
	
	zoom_slider.SetRange(cam_max_zoom);
	zoom_slider.SetValue(cam_max_zoom/2);

  cam_preview.StartPreview();
}
function ZoomCallback(value) {
	cam_preview.SetZoom(value);
}


// Math helper functions for Triangulate
function PositiveAngle( angle ) {
	angle = angle % 360
	if(angle < 0) {
		return angle + 360;
	}
	return angle;
}
const EARTH_RADIUS = 6378.137 // radius in km
const TO_RADIANS = Math.PI/180; // multiply by degree measurement to get radians
function deg2rad(deg) {
	return (deg*Math.PI)/180;
}
function rad2deg(rad) {
	return rad * (180/Math.PI);
}
function bearingBetween(A, B) { // returns bearing from A to B
	var x = Math.cos(deg2rad(B.latitude)) * Math.sin(deg2rad( B.longitude - A.longitude ));
	var y = Math.cos(deg2rad(A.latitude)) * Math.sin(deg2rad(B.latitude)) - Math.sin(deg2rad(A.latitude)) * Math.cos(deg2rad(B.latitude)) * Math.cos(deg2rad( B.longitude - A.longitude ));
	return rad2deg( Math.atan2(x, y) );
}
function haversine(A, B) { // returns distance between two points
	var d_lat = (B.latitude - A.latitude) * TO_RADIANS;
	var d_lon = (B.longitude - A.longitude) * TO_RADIANS;
	var A_lat = A.latitude * TO_RADIANS;
	var B_lat = B.latitude * TO_RADIANS;

	var a = Math.sin(d_lat/2) * Math.sin(d_lat/2) + Math.sin(d_lon/2) * Math.sin(d_lon/2) * Math.cos(A_lat) * Math.cos(B_lat);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
	return EARTH_RADIUS * c;
}
function travel(point, bearing, distance) { // return point found by traveling distance along bearing from point, forumla from igismap.com
	var la1 = deg2rad(point.latitude);
	var lo1 = deg2rad(point.longitude);
	var Ad = distance / EARTH_RADIUS;
	var theta = deg2rad(bearing);

	var la2 = Math.asin( Math.sin(la1) * Math.cos(Ad) + Math.cos(la1) * Math.sin(Ad) * Math.cos(theta));
	var lo2 = lo1 + Math.atan2( Math.sin(theta) * Math.sin(Ad) * Math.cos(la1), Math.cos(Ad) - Math.sin(la1) * Math.sin(la2))
	return {
		latitude: rad2deg(la2),
		longitude: rad2deg(lo2)
	};
}

function Triangulate(A, B) { // returns lat,long point C found by triangulating points A and B
	// Angle at A is angle_a = A.bearing - bearing between A and B
	// Angle at C is angle_c = A.bearing - B.bearing
  // Side from A to B is side_AB = distance from A to B
	// Side from B to C is side_BC = side_BC/sin(angle_a) = side_AB/sin(angle_c)
	// Point C is found by moving from B along B.bearing for side_BC km
	
	console.log("A = "+JSON.stringify(A));
	console.log("B = "+JSON.stringify(B));
	
	// Calc AB bearing
  var bearing_AB = bearingBetween(A, B); // tan calcs from East, +90 angle from North
	// bearing_AB = PositiveAngle(bearing_AB);
	console.log("bearing_AB = " + bearing_AB);

	var angle_a = PositiveAngle(bearing_AB - A.bearing);
	console.log("angle_a = " + angle_a);

	var angle_c = PositiveAngle(A.bearing - B.bearing);
	console.log("angle_c = " + angle_c);

	var side_AB = haversine(A, B);
	console.log("side_AB (km) = " + side_AB);

	var side_BC = side_AB * Math.sin(deg2rad(angle_a)) / Math.sin(deg2rad(angle_c));
	console.log("side_BC (km) = " + side_BC);

	var lat_from_B = side_BC*Math.sin(deg2rad(angle_a));
	var lon_from_B = side_BC*Math.cos(deg2rad(angle_a));
	if( B.bearing > 90 && B.bearing < 270 ) {
		lat_from_B *= -1;
	}
	if( B.bearing > 180 ) {
		lon_from_B *= -1;
	}

	C = travel(B, B.bearing, side_BC);
	console.log(JSON.stringify(C));
	enableButton(maps_btn);
	return C;
}

function TriangulateCallback() {
	if( DEBUG ) { // Hardcode known points for debugging
		p1 = { latitude: 0, longitude: 0, bearing: 0}
		p2 = { latitude: 0, longitude: 0, bearing: 0}
		target = Triangulate(p1, p2);
		return;
	}
	// Triangulate and update target text
	target = Triangulate(point1, point2);
	target_text.SetHtml(`<b>Target:</b> ${fixed(C.latitude)}, ${fixed(C.longitude)}`)
}


function OnConfig() { // runs when device orientation changes
	var app_orientation = app.GetOrientation();
	var layout_orient = "Vertical";
	if( app_orientation == "Landscape" ) {
		layout_orient = "Horizontal";
	}
	layout.SetOrientation( layout_orient );
}

// Called when application is started.
function OnStart()
{
	// Init GPS sensor
	var sensor_gps = app.CreateLocator("GPS,Network");
	sensor_gps.SetOnChange(locationTracker);
	sensor_gps.SetRate(0.1);
	sensor_gps.Start();
	console.log("Locator is: " + JSON.stringify(sensor_gps));

	// Init compass sensor
	var sensor_compass = app.CreateSensor( "Orientation", "Fast" );
	sensor_compass.SetOnChange( compassTracker );
	sensor_compass.Start();



	// Main layout
	layout = app.CreateLayout( "Linear", "VCenter,FillXY" );

	// Viewfinder sublayout contains camera, crosshair, and live position/bearing data
	var viewfinder = app.CreateLayout("Absolute")
	viewfinder.SetSize(0.8, 0.4);

	// Camera preview
	cam_preview = app.CreateCameraView(0.8, 0.4);
	cam_preview.SetOnReady(camReadyCallback);
	viewfinder.AddChild(cam_preview);

	// Camera crosshair
	cam_crosshair = app.CreateImage("Img/target.png", 0.2, 0.1, "TouchThrough");
	cam_crosshair.SetPosition(0.3, 0.15)
	viewfinder.AddChild(cam_crosshair);

	// Show current point data
	aim_text = app.CreateText("", 1, 0.05, "Multiline,Left");
	aim_text.SetBackColor("#80000000")
	aim_text.SetHtml("Initlaizing Sensors...");
	aim_text.SetLog(5)
	viewfinder.AddChild(aim_text);
	
	layout.AddChild(viewfinder);



	// Data sublayout contains the zoom slider, point buttons, point data, and map button
	var data_lay = app.CreateLayout("Linear", "VCenter")
	data_lay.SetSize(0.8, 0.4);

	// Zoom slider
	var zoom_text = app.CreateText("Zoom");
	data_lay.AddChild(zoom_text);
	zoom_slider = app.CreateSeekBar(0.8);
	zoom_slider.SetRange(99);
	zoom_slider.SetValue(99/2);
	zoom_slider.SetOnTouch(ZoomCallback);
	data_lay.AddChild(zoom_slider);
	
	// Empty text spacer between zoom and buttons
	var zoom_spacer = app.CreateText("");
	data_lay.AddChild(zoom_spacer);

	// Point1 text
	point1_text = app.CreateText();
	point1_text.SetHtml("<b>Point 1:</b> ...")
	data_lay.AddChild(point1_text);
	// Point2 text
	point2_text = app.CreateText();
	point2_text.SetHtml("<b>Point 2:</b> ...")
	data_lay.AddChild(point2_text);

	// Point1 update button;
	point1_btn = app.CreateButton("Point 1");
	point1_btn.SetOnTouch(SetPoint1);
	point1_btn.SetEnabled(false);
	data_lay.AddChild(point1_btn);
	// Point2 update button;
	point2_btn = app.CreateButton("Point 2");
	point2_btn.SetOnTouch(SetPoint2);
	point2_btn.SetEnabled(false);
	data_lay.AddChild(point2_btn);

	// Target text
	target_text = app.CreateText();
	target_text.SetHtml("<b>Target:</b> ...")
	data_lay.AddChild(target_text);

	// Open map button
	maps_btn = app.CreateButton("Open in Maps");
	maps_btn.SetOnTouch(mapCallback);
	maps_btn.SetEnabled(false);
	data_lay.AddChild(maps_btn);

	layout.AddChild(data_lay);

	
	// Add layout to app.	
	app.AddLayout( layout );


	if( DEBUG ) { // Enable all buttons and triangulate hardcoded points in debug mode.
		enableButton(point1_btn);
		enableButton(point2_btn);
		enableButton(maps_btn);
		TriangulateCallback()
	}
}
