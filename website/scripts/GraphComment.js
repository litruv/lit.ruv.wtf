/**
 * Represents a comment box for annotating/grouping nodes.
 * Similar to Unreal Engine blueprint comments.
 */
export class GraphComment {
    /**
     * @param {{ id: string, title: string, position: {x:number,y:number}, size: {width:number,height:number}, color?: string, opacity?: number }} init
     */
    constructor(init) {
        this.id = init.id;
        this.title = init.title;
        this.position = { ...init.position };
        this.size = { ...init.size };
        /** @type {string} */
        this.color = init.color || "#4a5568";
        /** @type {number} */
        this.opacity = init.opacity ?? 0.15;
    }
}
