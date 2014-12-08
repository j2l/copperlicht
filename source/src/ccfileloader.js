//+ Nikolaus Gebhardt
// This file is part of the CopperLicht library, copyright by Nikolaus Gebhardt

/**
 * @constructor
 * @private
 */
CL3D.CCFileLoader = function(filetoload)
{
	this.FileToLoad = filetoload;
	this.xmlhttp = false;
	
	// init xmlhttp

	if (!this.xmlhttp && typeof XMLHttpRequest != 'undefined') 
	{
		try 
		{
			this.xmlhttp = new XMLHttpRequest();
		} catch (e) 
		{
			this.xmlhttp = false;
		}
	}
	
	if (!this.xmlhttp && window.createRequest) 
	{
		try 
		{
			this.xmlhttp = window.createRequest();
		}
		catch (e) 
		{
			this.xmlhttp = false;
		}
	}
	
	// functions
	
	this.load = function(functionCallBack)
	{
		if (this.xmlhttp == false)
		{
			CL3D.gCCDebugOutput.printError("Your browser doesn't support AJAX");
			return;
		}
		
		var me = this;
		
		try
		{
			this.xmlhttp.open("GET", this.FileToLoad, true);
		}
		catch(e)
		{
			CL3D.gCCDebugOutput.printError("Could not open file " + this.FileToLoad + ": " + e.message);
			
			// chrome doesn't allow loading local files anymore, check if this was the case
			var browserVersion = navigator.appVersion; 
			if (browserVersion != null && browserVersion.indexOf('Trident') != -1)
				CL3D.gCCDebugOutput.printError("<i>Use a web server to run files in IE. Or start them from CopperCube.</i>", true);
			return;
		}
		
		//this.xmlhttp.overrideMimeType("text/plain; charset=x-user-defined");
		
		this.xmlhttp.onreadystatechange = function() 
		{ 
			if (me.xmlhttp.readyState == 4) 
			{
				if (me.xmlhttp.status != 200 && me.xmlhttp.status != 0 && me.xmlhttp.status != null)
				{
					CL3D.gCCDebugOutput.printError("Could not open file " + me.FileToLoad + " (status:" + me.xmlhttp.status + ")" );
				}
				if (functionCallBack)
					functionCallBack(me.xmlhttp.responseText); 
			}
		}
		
		try
		{
			this.xmlhttp.send(null);
		}
		catch(e)
		{
			CL3D.gCCDebugOutput.printError("Could not open file " + me.FileToLoad); // + ": " + e.message);
			return;
		}
	};
	
	// abort function
	this.abort = function()
	{
		try
		{
			this.xmlhttp.abort();
		}
		catch(e)
		{
			//CL3D.gCCDebugOutput.printError("Could not abort " + me.FileToLoad); 
		}
	}
};