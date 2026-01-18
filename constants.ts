import { Template } from './types';

const STANDARD_TEMPLATE = `
# <% tp.file.title %>

## Citation

> [!cite] Reference
> **Authors**: 
> **Year**: 
> **Journal**: 
> **DOI**: 

## Abstract

## Key Points

-
-
-

## Methods

### Sample Preparation
- Method used: [[SCoPE2]] / [[plexDIA]] / [[nPOP]]
- Cell type:
- Number of cells:

### Data Analysis
- Software: [[MaxQuant]] / [[DIA-NN]]
- Downstream: [[scp Package]]

## Results

### Main Findings
1.
2.
3.

### Figures

| Figure | Description |
|--------|-------------|
| Fig 1 | |
| Fig 2 | |

## Discussion

### Strengths
-

### Limitations
-

### Future Work
-

## Personal Notes

## Related Papers

-
`;

const BRIEF_TEMPLATE = `
# <% tp.file.title %>

## TL;DR
<!-- A 1-2 sentence summary of the entire paper -->

## Key Takeaways
1. 
2. 
3. 

## Practical Application
<!-- How can this be used? -->

## Citation
- **Year**: 
- **Authors**: 
`;

const METHODS_TEMPLATE = `
# <% tp.file.title %>

## Methodological Deep Dive

### Experimental Design
- **Subjects/Samples**: 
- **Controls**: 
- **Variables**: 

### Techniques Used
- 
- 

### Statistical Approach
- 

## Results Validation
- Did the results support the hypothesis? 
`;

export const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'standard',
    name: 'Standard Obsidian Digest',
    content: STANDARD_TEMPLATE,
    isDefault: true,
  },
  {
    id: 'brief',
    name: 'Brief Summary',
    content: BRIEF_TEMPLATE,
    isDefault: true,
  },
  {
    id: 'methods',
    name: 'Methods & Data Focus',
    content: METHODS_TEMPLATE,
    isDefault: true,
  }
];
