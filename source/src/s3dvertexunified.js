//+ Nikolaus Gebhardt
// This file is part of the CopperLicht library, copyright by Nikolaus Gebhardt
// This file is part of the CopperLicht engine, (c) by N.Gebhardt

/**
 * A 3d vertex, ususally used in {@link MeshBuffer}s
 * @constructor
 * @class A 3d vertex, ususally used in {@link MeshBuffer}s
 * @param {Boolean} init set to true to let the vertex members (Position, Normal etc) be initialized with instances of classes, false if not.
 */
CL3D.Vertex3D = function(init)
{
	if (init)
	{
		this.Pos = new CL3D.Vect3d();
		this.Normal = new CL3D.Vect3d();
		this.Color = 0xffffffff;
		this.TCoords = new CL3D.Vect2d();
		this.TCoords2 = new CL3D.Vect2d();
	}
}

/** 
 * 3D Position of the vertex
 * @public
 * @type Vertex3d
 */
CL3D.Vertex3D.prototype.Pos = null;

/** 
 * Normal of the vertex
 * @public
 * @type Vertex3d
 */
CL3D.Vertex3D.prototype.Normal = null;

/** 
 * Color of the vertex
 * @public
 * @type int
 */
CL3D.Vertex3D.prototype.Color = 0;

/** 
 * Texture coordinate 1 of the vertex
 * @public
 * @type Vertex3d
 */
CL3D.Vertex3D.prototype.TCoords = null;

/** 
 * Texture coordinate 2 of the vertex
 * @public
 * @type Vertex3d
 */
CL3D.Vertex3D.prototype.TCoords2 = null;
